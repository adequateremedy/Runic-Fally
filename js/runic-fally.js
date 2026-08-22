import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

// FIREBASE SETUP
const firebaseConfig = {
    apiKey: "AIzaSyAeyOzh9YHaQDMSvn-8-ZyVqXkwY_diL5Y",
    authDomain: "solus-dynasty-rpg.firebaseapp.com",
    projectId: "solus-dynasty-rpg"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.appdata');

// DATA LOGIC
let gDriveToken = sessionStorage.getItem("gDriveToken") || null;
let dataFileId = null;
let playerJsonData = {};
let engineStarted = false;

const MAX_POINTS = 2000;
const POINTS_PER_EXP = 20;

const screens = {
    login: document.getElementById('loginScreen'),
    loading: document.getElementById('loadingScreen'),
    game: document.getElementById('gameUI'),
    tally: document.getElementById('tallyModal'),
    complete: document.getElementById('completeModal')
};

function switchScreen(activeKey) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if(activeKey) screens[activeKey].classList.remove('hidden');
}

async function syncDriveData() {
    const res = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='character_data.json'", {
        headers: { 'Authorization': `Bearer ${gDriveToken}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
        dataFileId = data.files[0].id;
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${dataFileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${gDriveToken}` }
        });
        playerJsonData = await fileRes.json();
    }

    if (playerJsonData.class1Points === undefined) playerJsonData.class1Points = 0;
    if (playerJsonData.class1Round === undefined) playerJsonData.class1Round = 1;
    if (playerJsonData.class1Exp === undefined) playerJsonData.class1Exp = 0;
}

async function saveDriveData() {
    if (!dataFileId) return;
    
    // Automatically configure the EXP conversion before saving
    playerJsonData.class1Exp = Math.floor(playerJsonData.class1Points / POINTS_PER_EXP);
    if (playerJsonData.class1Exp > 100) playerJsonData.class1Exp = 100;

    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${dataFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${gDriveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(playerJsonData)
    });
}

// AUTHENTICATION
onAuthStateChanged(auth, async (user) => {
    if (user && gDriveToken) {
        switchScreen('loading');
        await syncDriveData();
        initGameEngine();
    }
});

document.getElementById("googleSignInButton").addEventListener("click", async () => {
    switchScreen('loading');
    try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        gDriveToken = credential.accessToken;
        sessionStorage.setItem("gDriveToken", gDriveToken);
        await syncDriveData();
        initGameEngine();
    } catch (e) {
        console.error(e);
        switchScreen('login');
    }
});

// NAVIGATION BUTTONS
document.getElementById("returnHubBtn").addEventListener("click", () => {
    window.location.href = "https://adequateremedy.github.io/RPG-Hub/";
});

document.getElementById("completeReturnHubBtn").addEventListener("click", () => {
    window.location.href = "https://adequateremedy.github.io/RPG-Hub/";
});

document.getElementById("restartClassBtn").addEventListener("click", async () => {
    const confirmRestart = confirm("Are you sure you want to restart Class 1? All progress and points will be erased.");
    if (confirmRestart) {
        playerJsonData.class1Points = 0;
        playerJsonData.class1Round = 1;
        playerJsonData.class1Exp = 0;
        await saveDriveData();
        screens.tally.classList.add('hidden');
        startRound();
    }
});

document.getElementById("nextRoundBtn").addEventListener("click", () => {
    screens.tally.classList.add('hidden');
    startRound();
});

// ==========================================
// GAME ENGINE
// ==========================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const RUNE_NAMES = ['Berkano', 'Dagaz', 'Fehu', 'Hagalaz', 'Jera', 'Kenaz', 'Perthro', 'Teiwaz', 'Uruz'];
const ASSETS = { normal: {}, glow: {}, cards: {}, star: null, starGlow: null };

let imagesLoaded = 0;
let totalImages = (RUNE_NAMES.length * 3) + 2;

// Locked 10x10 Grid
const COLS = 10;
const ROWS = 10;
let tileSize = 0;
let grid = [];
let state = {
    roundScore: 0,
    stars: 0,
    timeLeft: 60,
    playing: false,
    dragging: false,
    selection: [],
    bombMode: false,
    collectedRunes: {} 
};

let timerInterval;

function updateProgress() {
    const percent = Math.floor((imagesLoaded / totalImages) * 100);
    document.getElementById("progressBarFill").style.width = `${percent}%`;
    document.getElementById("loadingPercent").innerText = `${percent}%`;
}

function preloadImages(callback) {
    const onLoad = () => { 
        imagesLoaded++; 
        updateProgress();
        if(imagesLoaded === totalImages) callback(); 
    };

    const onError = (e) => {
        const msg = document.getElementById("loadingMsg");
        const brokenFile = e.target.src ? e.target.src.split('/').pop() : "unknown file";
        msg.innerHTML += `<br><span style="color:#ffb0b0;">Failed to load: ${brokenFile}</span>`;
        imagesLoaded++; 
        updateProgress();
        if(imagesLoaded === totalImages) callback(); 
    };

    RUNE_NAMES.forEach(name => {
        ASSETS.normal[name] = new Image(); 
        ASSETS.normal[name].onload = onLoad; 
        ASSETS.normal[name].onerror = onError;
        ASSETS.normal[name].src = `assets/Runic-Stones/${name}-Runic-Stone.png`; 
        
        ASSETS.glow[name] = new Image(); 
        ASSETS.glow[name].onload = onLoad; 
        ASSETS.glow[name].onerror = onError;
        ASSETS.glow[name].src = `assets/Runic-Stones-Glow/${name}-Runic-Stone-Glow.png`; 
        
        ASSETS.cards[name] = new Image(); 
        ASSETS.cards[name].onload = onLoad; 
        ASSETS.cards[name].onerror = onError;
        ASSETS.cards[name].src = `assets/Runic-Stone-Card/${name}-Runic-Stone-Glow-Card.png`; 
    });

    ASSETS.star = new Image(); 
    ASSETS.star.onload = onLoad; 
    ASSETS.star.onerror = onError;
    ASSETS.star.src = `assets/Star/Star-Symbol.png`; 
    
    ASSETS.starGlow = new Image(); 
    ASSETS.starGlow.onload = onLoad; 
    ASSETS.starGlow.onerror = onError;
    ASSETS.starGlow.src = `assets/Star/Star-Symbol-Glow.png`; 
}

function initGameEngine() {
    if (engineStarted) return; 
    engineStarted = true;

    document.getElementById("loadingMsg").innerText = "Loading magical assets...";
    document.getElementById("progressBarContainer").classList.remove("hidden");
    document.getElementById("loadingPercent").classList.remove("hidden");
    
    preloadImages(() => {
        setupInput();
        startRound();
        window.addEventListener('resize', resizeCanvas);
    });
}

function resizeCanvas() {
    const container = document.getElementById("canvasContainer");
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    tileSize = canvas.width / COLS;
    drawGrid();
}

function getActiveRuneTypes() {
    // Difficulty scaling: Round 1 = 4 types, progressively adding more
    const typesPerRound = [4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9];
    let numTypes = typesPerRound[Math.min(playerJsonData.class1Round - 1, 10)];
    return RUNE_NAMES.slice(0, numTypes);
}

function generateGrid() {
    grid = [];
    const activeTypes = getActiveRuneTypes();
    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            row.push({ type: activeTypes[Math.floor(Math.random() * activeTypes.length)], yOffset: -canvas.height });
        }
        grid.push(row);
    }
    ensurePossibleMatch();
}

function ensurePossibleMatch() {
    while (!hasPossibleMatch()) {
        const activeTypes = getActiveRuneTypes();
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c].type !== 'STAR') {
                    grid[r][c].type = activeTypes[Math.floor(Math.random() * activeTypes.length)];
                }
            }
        }
    }
}

function hasPossibleMatch() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (grid[r][c].type === 'STAR') return true;
            if (dfs(r, c, grid[r][c].type, [], 1)) return true;
        }
    }
    return false;
}

function dfs(r, c, type, visited, depth) {
    if (depth >= 3) return true;
    visited.push(`${r},${c}`);
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (let [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && grid[nr][nc] && grid[nr][nc].type === type && !visited.includes(`${nr},${nc}`)) {
            if (dfs(nr, nc, type, [...visited], depth + 1)) return true;
        }
    }
    return false;
}

function updateUI() {
    document.getElementById("uiRound").innerText = playerJsonData.class1Round;
    document.getElementById("uiScore").innerText = state.roundScore;
    document.getElementById("uiTime").innerText = state.timeLeft;
    document.getElementById("uiTotalPoints").innerText = `${playerJsonData.class1Points} / ${MAX_POINTS}`;
    document.getElementById("uiStars").innerText = state.stars;
    
    const bBtn = document.getElementById("bombBtn");
    if (state.stars > 0) { bBtn.disabled = false; } 
    else { bBtn.disabled = true; state.bombMode = false; }
    
    if (state.bombMode) bBtn.classList.add("active");
    else bBtn.classList.remove("active");
}

document.getElementById("bombBtn").addEventListener("click", () => {
    if (state.stars > 0) {
        state.bombMode = !state.bombMode;
        updateUI();
    }
});

function startRound() {
    if(playerJsonData.class1Points >= MAX_POINTS) {
        switchScreen('complete');
        return;
    }

    switchScreen('game');
    resizeCanvas(); 

    state.roundScore = 0;
    state.timeLeft = 60;
    state.playing = true;
    state.bombMode = false;
    state.stars = 0;
    state.collectedRunes = {};
    RUNE_NAMES.forEach(n => state.collectedRunes[n] = 0);
    
    generateGrid();
    updateUI();

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if(!state.playing) return;
        state.timeLeft--;
        updateUI();
        if(state.timeLeft <= 0) {
            endRound();
        }
    }, 1000);
    
    requestAnimationFrame(gameLoop);
}

function calculateGrade(points) {
    let percent = Math.floor((points / MAX_POINTS) * 100);
    if (percent > 100) percent = 100;
    
    let grade = "F";
    if (percent >= 90) grade = "A";
    else if (percent >= 70) grade = "B";
    else if (percent >= 50) grade = "C";
    else if (percent >= 30) grade = "D";

    return { grade, percent };
}

function endRound() {
    state.playing = false;
    clearInterval(timerInterval);
    
    // Add round score to total
    playerJsonData.class1Points += state.roundScore;
    playerJsonData.class1Round++;
    
    saveDriveData(); 

    // Calculate Grades based on total progression
    const result = calculateGrade(playerJsonData.class1Points);

    document.getElementById("tallyRoundNumber").innerText = playerJsonData.class1Round - 1;
    document.getElementById("tallyScore").innerText = state.roundScore;
    document.getElementById("tallyGrade").innerText = result.grade;
    document.getElementById("tallyPercent").innerText = result.percent;
    
    // Set grade color
    const gradeColor = result.grade === "A" ? "#4caf50" : 
                       result.grade === "B" ? "#8bc34a" : 
                       result.grade === "C" ? "#ffeb3b" : 
                       result.grade === "D" ? "#ff9800" : "#f44336";
    document.getElementById("tallyGrade").style.color = gradeColor;
    
    // Show collected cards
    const tc = document.getElementById("tallyCards");
    tc.innerHTML = "";
    Object.keys(state.collectedRunes).forEach(rune => {
        if (state.collectedRunes[rune] > 0) {
            let div = document.createElement('div');
            div.className = "tally-card";
            div.innerHTML = `
                <span style="display:block; margin-bottom:5px; color:#e3d2b9; font-weight:bold; font-size:1.1rem; letter-spacing:1px;">${rune}</span>
                <img src="${ASSETS.cards[rune].src}">
                <br><span>x${state.collectedRunes[rune]}</span>
            `;
            tc.appendChild(div);
        }
    });

    if(playerJsonData.class1Points >= MAX_POINTS) {
        switchScreen('complete');
    } else {
        screens.tally.classList.remove('hidden');
    }
}

// --- INTERACTION ---
function setupInput() {
    const getGridPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let x = (clientX - rect.left) * scaleX;
        let y = (clientY - rect.top) * scaleY;
        
        return { c: Math.floor(x / tileSize), r: Math.floor(y / tileSize) };
    };

    const onStart = (e) => {
        if (!state.playing) return;
        const { r, c } = getGridPos(e);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

        if (state.bombMode && grid[r][c].type !== 'STAR') {
            grid[r][c].type = 'STAR';
            state.stars--;
            state.bombMode = false;
            updateUI();
            return;
        }

        if (grid[r][c].type === 'STAR') {
            explodeStar(r, c);
            return;
        }

        state.dragging = true;
        state.selection = [{r, c}];
    };

    const onMove = (e) => {
        if (!state.dragging || !state.playing) return;
        const { r, c } = getGridPos(e);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;

        const last = state.selection[state.selection.length - 1];
        if (last.r === r && last.c === c) return;

        const dr = Math.abs(last.r - r);
        const dc = Math.abs(last.c - c);
        if (dr <= 1 && dc <= 1) {
            const targetType = grid[state.selection[0].r][state.selection[0].c].type;
            if (grid[r][c].type === targetType && grid[r][c].type !== 'STAR') {
                const exists = state.selection.findIndex(s => s.r === r && s.c === c);
                if (exists !== -1) {
                    state.selection = state.selection.slice(0, exists + 1);
                } else {
                    state.selection.push({r, c});
                }
            }
        }
    };

    const onEnd = () => {
        if (!state.dragging) return;
        state.dragging = false;

        const chainLength = state.selection.length;
        if (chainLength >= 3) {
            let ptsEarned = 0;
            if (chainLength === 3) ptsEarned = 1;
            else if (chainLength === 4) ptsEarned = 5;
            else if (chainLength === 5) ptsEarned = 10;
            else if (chainLength >= 6) ptsEarned = 20;

            let type = grid[state.selection[0].r][state.selection[0].c].type;
            state.roundScore += ptsEarned;
            state.collectedRunes[type] += chainLength;
            
            if (chainLength >= 4) {
                state.stars++;
            }

            state.selection.forEach(s => { grid[s.r][s.c] = null; });
            processGravity();
        }
        state.selection = [];
        updateUI();
    };

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    
    canvas.addEventListener('touchstart', onStart, {passive: false});
    canvas.addEventListener('touchmove', onMove, {passive: false});
    window.addEventListener('touchend', onEnd);
}

function explodeStar(r, c) {
    grid[r][c] = null;
    if(r-1 >= 0) { if(grid[r-1][c]) addExplodedScore(grid[r-1][c].type); grid[r-1][c] = null; }
    if(r+1 < ROWS) { if(grid[r+1][c]) addExplodedScore(grid[r+1][c].type); grid[r+1][c] = null; }
    if(c-1 >= 0) { if(grid[r][c-1]) addExplodedScore(grid[r][c-1].type); grid[r][c-1] = null; }
    if(c+1 < COLS) { if(grid[r][c+1]) addExplodedScore(grid[r][c+1].type); grid[r][c+1] = null; }
    processGravity();
    updateUI();
}

function addExplodedScore(type) {
    if(type && type !== 'STAR') {
        state.roundScore += 1; // Base bomb collection point
        state.collectedRunes[type]++;
    }
}

function processGravity() {
    const activeTypes = getActiveRuneTypes();
    for (let c = 0; c < COLS; c++) {
        let emptySpaces = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (grid[r][c] === null) {
                emptySpaces++;
            } else if (emptySpaces > 0) {
                grid[r + emptySpaces][c] = grid[r][c];
                grid[r][c] = null;
            }
        }
        for (let i = 0; i < emptySpaces; i++) {
            grid[i][c] = { type: activeTypes[Math.floor(Math.random() * activeTypes.length)], yOffset: -tileSize * (emptySpaces - i) };
        }
    }
    ensurePossibleMatch();
}

// --- DRAWING ---
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!grid || grid.length === 0) return; 

    // Draw connections
    if (state.selection.length > 1) {
        ctx.beginPath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#e3d2b9';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < state.selection.length; i++) {
            const cx = state.selection[i].c * tileSize + tileSize / 2;
            const cy = state.selection[i].r * tileSize + tileSize / 2;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.stroke();
    }

    // Draw Stones
    const padding = tileSize * 0.1;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let cell = grid[r][c];
            if (!cell) continue;

            if (cell.yOffset < 0) {
                cell.yOffset += 8; 
                if (cell.yOffset > 0) cell.yOffset = 0;
            }

            let x = c * tileSize;
            let y = r * tileSize + (cell.yOffset || 0);

            let isSelected = state.selection.find(s => s.r === r && s.c === c);
            let img;

            if (cell.type === 'STAR') {
                img = ASSETS.star;
            } else {
                img = isSelected ? ASSETS.glow[cell.type] : ASSETS.normal[cell.type];
            }

            if (img && img.complete) {
                ctx.drawImage(img, x + padding, y + padding, tileSize - padding*2, tileSize - padding*2);
            }
        }
    }
}

function gameLoop() {
    if(state.playing) {
        drawGrid();
        requestAnimationFrame(gameLoop);
    }
}
