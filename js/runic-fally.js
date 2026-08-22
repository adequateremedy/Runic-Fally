import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

// FIREBASE SETUP
const firebaseConfig = {
    apiKey: "AIzaSyAeyOzh9YHaQDMSvn-8-ZyVqXkwY_diL5Y",
    authDomain: "solus-dynasty-rpg.firebaseapp.com",
    projectId: "solus-dynasty-rpg"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// DATA LOGIC
let gDriveToken = sessionStorage.getItem("gDriveToken") || null;
let dataFileId = null;
let playerJsonData = {};

const MAX_POINTS = 2000;
const POINTS_PER_EXP = 20;

// AUDIO ENGINE
const BGM_TRACKS = [
    new Audio('assets/Music/Garden-of-Clocks.mp3'),
    new Audio('assets/Music/Preschool-Fae.mp3')
];
let currentTrackIndex = 0;

BGM_TRACKS.forEach((track, index) => {
    track.volume = 0.5;
    track.addEventListener('ended', () => {
        currentTrackIndex = (index + 1) % BGM_TRACKS.length;
        BGM_TRACKS[currentTrackIndex].play().catch(e => console.log("Audio play prevented:", e));
    });
});

function playBGM() {
    BGM_TRACKS[currentTrackIndex].play().catch(e => console.log("Audio play prevented:", e));
}

function pauseBGM() {
    BGM_TRACKS[currentTrackIndex].pause();
}

const screens = {
    loading: document.getElementById('loadingScreen'),
    welcome: document.getElementById('welcomeScreen'),
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
    if (playerJsonData.class1Stars === undefined) playerJsonData.class1Stars = 0;
    
    if (playerJsonData.schoolProgress === undefined) {
        playerJsonData.schoolProgress = { class1: false, class2: false, class3: false, class4: false, class5: false };
    }
    
    state.stars = playerJsonData.class1Stars;
}

async function saveDriveData() {
    if (!dataFileId) return;
    playerJsonData.class1Exp = Math.floor(playerJsonData.class1Points / POINTS_PER_EXP);
    if (playerJsonData.class1Exp > 100) playerJsonData.class1Exp = 100;
    playerJsonData.class1Stars = state.stars;
    
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${dataFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${gDriveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(playerJsonData)
    });
}

// AUTHENTICATION & INITIALIZATION
onAuthStateChanged(auth, async (user) => {
    if (user && gDriveToken) {
        await syncDriveData();
        initAssetLoading();
    } else {
        window.location.href = "https://adequateremedy.github.io/RPG-Hub/";
    }
});

// NAVIGATION BUTTONS
document.getElementById("returnHubBtn").addEventListener("click", () => {
    window.location.href = "https://adequateremedy.github.io/RPG-Hub/";
});

document.getElementById("hubRedirectBtn").addEventListener("click", () => {
    window.location.href = "https://adequateremedy.github.io/RPG-Hub/";
});

document.getElementById("restartClassBtn").addEventListener("click", async () => {
    const confirmRestart = confirm("Are you sure you want to restart Class 1? All progress and points will be erased.");
    if (confirmRestart) {
        playerJsonData.class1Points = 0;
        playerJsonData.class1Round = 1;
        playerJsonData.class1Exp = 0;
        playerJsonData.class1Stars = 0;
        state.stars = 0;
        await saveDriveData();
        pauseBGM();
        BGM_TRACKS[currentTrackIndex].currentTime = 0;
        currentTrackIndex = 0;
        screens.tally.classList.add('hidden');
        startRound();
    }
});

document.getElementById("nextRoundBtn").addEventListener("click", () => {
    screens.tally.classList.add('hidden');
    startRound();
});

document.getElementById("startClassBtn").addEventListener("click", () => {
    startRound();
});

document.getElementById("continueClassBtn").addEventListener("click", () => {
    startRound();
});

document.getElementById("retakeGraduateBtn").addEventListener("click", async () => {
    const confirmRetake = confirm("Are you sure you want to retake the class? This will erase your 2,000 points and return you to Round 1.");
    if (confirmRetake) {
        playerJsonData.class1Points = 0;
        playerJsonData.class1Round = 1;
        playerJsonData.class1Exp = 0;
        playerJsonData.class1Stars = 0;
        state.stars = 0;
        await saveDriveData();
        pauseBGM();
        BGM_TRACKS[currentTrackIndex].currentTime = 0;
        currentTrackIndex = 0;
        screens.complete.classList.add('hidden');
        startRound();
    }
});

document.getElementById("saveGraduateBtn").addEventListener("click", async () => {
    document.getElementById("loadingMsg").innerText = "Saving Graduation & Adding 100 EXP...";
    switchScreen('loading');
    playerJsonData.schoolProgress.class1 = true;
    playerJsonData.exp = (playerJsonData.exp || 0) + 100;
    await saveDriveData();
    window.location.href = "https://adequateremedy.github.io/RPG-Hub/";
});

// ==========================================
// GAME ENGINE & ANIMATIONS
// ==========================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const RUNE_NAMES = ['Berkano', 'Dagaz', 'Fehu', 'Hagalaz', 'Jera', 'Kenaz', 'Perthro', 'Teiwaz', 'Uruz'];
const ASSETS = { normal: {}, glow: {}, cards: {}, star: null, starGlow: null };

let imagesLoaded = 0;
let totalImages = (RUNE_NAMES.length * 3) + 2;

const COLS = 10;
const ROWS = 10;
let tileSize = 0;
let grid = [];

// Animation State
let particles = [];
let floatingTexts = [];
let shakeFrames = 0;

let state = {
    roundScore: 0,
    stars: 0,
    timeLeft: 60,
    playing: false,
    inputLocked: false,
    dragging: false,
    selection: [],
    bombMode: false,
    collectedRunes: {},
    dissolveTimer: 0,
    dissolvingCells: []
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

function initAssetLoading() {
    document.getElementById("loadingMsg").innerText = "Loading magical assets...";
    document.getElementById("progressBarContainer").classList.remove("hidden");
    document.getElementById("loadingPercent").classList.remove("hidden");
    
    preloadImages(() => {
        setupInput();
        window.addEventListener('resize', resizeCanvas);
        showWelcomeScreen();
    });
}

function showWelcomeScreen() {
    switchScreen('welcome');
    if (playerJsonData.schoolProgress && playerJsonData.schoolProgress.class1 === true) {
        document.getElementById('newPlayerPanel').classList.add('hidden');
        document.getElementById('returningPlayerPanel').classList.add('hidden');
        document.getElementById('graduatedPanel').classList.remove('hidden');
    } else if (playerJsonData.class1Points > 0) {
        document.getElementById('newPlayerPanel').classList.add('hidden');
        document.getElementById('graduatedPanel').classList.add('hidden');
        document.getElementById('returningPlayerPanel').classList.remove('hidden');
        const result = calculateGrade(playerJsonData.class1Points);
        document.getElementById("welcomeGrade").innerText = result.grade;
        document.getElementById("welcomePercent").innerText = result.percent;
        const gradeColor = result.grade === "A" ? "#4caf50" : 
                           result.grade === "B" ? "#8bc34a" : 
                           result.grade === "C" ? "#ffeb3b" : 
                           result.grade === "D" ? "#ff9800" : "#f44336";
        document.getElementById("welcomeGrade").style.color = gradeColor;
    } else {
        document.getElementById('returningPlayerPanel').classList.add('hidden');
        document.getElementById('graduatedPanel').classList.add('hidden');
        document.getElementById('newPlayerPanel').classList.remove('hidden');
    }
}

function resizeCanvas() {
    const container = document.getElementById("canvasContainer");
    let w = container.clientWidth;
    let h = container.clientHeight;
    
    // Safety check just in case layout isn't fully calculated yet
    if (w === 0) {
        w = Math.min(window.innerWidth * 0.95, window.innerHeight * 0.85) - 20;
        h = w;
    }

    canvas.width = w;
    canvas.height = h;
    tileSize = canvas.width / COLS;
    if (grid.length > 0) drawGrid();
}

function getActiveRuneTypes() {
    // Adjusted difficulty progression array
    const typesPerRound = [4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 9];
    const index = Math.min(playerJsonData.class1Round - 1, typesPerRound.length - 1);
    let numTypes = typesPerRound[index];
    return RUNE_NAMES.slice(0, numTypes);
}

function generateGrid() {
    grid = [];
    const activeTypes = getActiveRuneTypes();
    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            row.push({ type: activeTypes[Math.floor(Math.random() * activeTypes.length)], yOffset: -canvas.height, vy: 0 });
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
    if (state.stars > 0 && !state.inputLocked) { bBtn.disabled = false; } 
    else { bBtn.disabled = true; state.bombMode = false; }
    
    if (state.bombMode) bBtn.classList.add("active");
    else bBtn.classList.remove("active");
}

document.getElementById("bombBtn").addEventListener("click", () => {
    if (state.stars > 0 && !state.inputLocked) {
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
    
    // Give browser 1 frame to snap CSS layout into place so height reads correctly
    requestAnimationFrame(() => {
        resizeCanvas(); 
        playBGM();

        state.roundScore = 0;
        state.timeLeft = 60;
        state.playing = true;
        state.inputLocked = false;
        state.bombMode = false;
        state.collectedRunes = {};
        particles = [];
        floatingTexts = [];
        
        state.selection = [];
        state.dissolvingCells = [];
        state.dissolveTimer = 0;
        
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
    });
}

function endRound() {
    state.playing = false;
    clearInterval(timerInterval);
    pauseBGM();
    
    playerJsonData.class1Points += state.roundScore;
    playerJsonData.class1Round++;
    
    saveDriveData(); 

    const result = calculateGrade(playerJsonData.class1Points);

    document.getElementById("tallyRoundNumber").innerText = playerJsonData.class1Round - 1;
    document.getElementById("tallyScore").innerText = state.roundScore;
    document.getElementById("tallyGrade").innerText = result.grade;
    document.getElementById("tallyPercent").innerText = result.percent;
    
    const gradeColor = result.grade === "A" ? "#4caf50" : 
                       result.grade === "B" ? "#8bc34a" : 
                       result.grade === "C" ? "#ffeb3b" : 
                       result.grade === "D" ? "#ff9800" : "#f44336";
    document.getElementById("tallyGrade").style.color = gradeColor;
    
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

// --- PARTICLE ENGINES ---
function createSparkleParticle(x, y) {
    return {
        type: 'sparkle',
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5 + 0.5,
        size: Math.random() * 2 + 1,
        life: 20, maxLife: 20
    };
}

function createSteamParticle(x, y) {
    return {
        type: 'steam',
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 1,
        vy: -Math.random() * 2 - 1, 
        size: Math.random() * 8 + 4,
        life: 30, maxLife: 30
    };
}

function createBlastParticle(x, y) {
    let angle = Math.random() * Math.PI * 2;
    let speed = Math.random() * 6 + 2;
    let isWhite = Math.random() > 0.5;
    return {
        type: 'blast',
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        color: isWhite ? 'rgba(255,255,255,1)' : 'rgba(255,215,0,1)',
        life: 25, maxLife: 25
    };
}

// --- GLOBAL FAE SPARKLES (Everywhere on Screen) ---
const fxCanvas = document.getElementById("fxCanvas");
const fxCtx = fxCanvas.getContext("2d");
let globalSparkles = [];

function resizeFx() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeFx);
resizeFx();

function spawnGlobalSparkle(x, y) {
    for(let i=0; i<2; i++) {
        globalSparkles.push(createSparkleParticle(x, y));
    }
}

window.addEventListener('mousemove', (e) => spawnGlobalSparkle(e.clientX, e.clientY));
window.addEventListener('touchmove', (e) => {
    if(e.touches.length > 0) {
        spawnGlobalSparkle(e.touches[0].clientX, e.touches[0].clientY);
    }
}, {passive: true});

function fxLoop() {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    for (let i = globalSparkles.length - 1; i >= 0; i--) {
        let p = globalSparkles[i];
        p.x += p.vx;
        p.y += p.vy;
        let alpha = p.life / p.maxLife;
        fxCtx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        fxCtx.fill();
        p.life--;
        if (p.life <= 0) globalSparkles.splice(i, 1);
    }
    requestAnimationFrame(fxLoop);
}
requestAnimationFrame(fxLoop);

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
        if (!state.playing || state.inputLocked) return;
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
        if (!state.dragging || !state.playing || state.inputLocked) return;
        
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
        if (!state.dragging || state.inputLocked) return;
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

            // Calculate center for Floating Text
            let sumR = 0, sumC = 0;
            state.selection.forEach(s => { sumR += s.r; sumC += s.c; });
            let avgR = sumR / chainLength;
            let avgC = sumC / chainLength;
            floatingTexts.push({ 
                x: avgC * tileSize + tileSize/2, 
                y: avgR * tileSize, 
                text: `+${ptsEarned}`, 
                life: 60, maxLife: 60 
            });

            pulseScoreboard();

            // Initiate Match Flare & Dissolve Sequence
            state.inputLocked = true;
            state.dissolveTimer = 25; 
            state.dissolvingCells = [...state.selection];
            
        } else {
            // Did not form a valid chain, just clear selection
            state.selection = [];
            updateUI();
        }
    };

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    
    canvas.addEventListener('touchstart', onStart, {passive: false});
    canvas.addEventListener('touchmove', onMove, {passive: false});
    window.addEventListener('touchend', onEnd);
}

function pulseScoreboard() {
    const scoreEl = document.getElementById("uiScore");
    scoreEl.classList.remove("pulse-score");
    void scoreEl.offsetWidth; // Trigger reflow
    scoreEl.classList.add("pulse-score");
}

function explodeStar(r, c) {
    shakeFrames = 15; // Trigger Screen Shake
    
    let cx = c * tileSize + tileSize/2;
    let cy = r * tileSize + tileSize/2;
    
    // Blast Particles
    for(let i=0; i<40; i++) {
        particles.push(createBlastParticle(cx, cy));
    }

    let affected = [{r, c}];
    if(r-1 >= 0 && grid[r-1][c]) affected.push({r: r-1, c});
    if(r+1 < ROWS && grid[r+1][c]) affected.push({r: r+1, c});
    if(c-1 >= 0 && grid[r][c-1]) affected.push({r, c: c-1});
    if(c+1 < COLS && grid[r][c+1]) affected.push({r, c: c+1});

    let ptsEarned = 0;
    affected.forEach(s => {
        let cell = grid[s.r][s.c];
        if(cell && cell.type !== 'STAR') {
            ptsEarned += 1;
            state.collectedRunes[cell.type]++;
        }
    });

    if (ptsEarned > 0) {
        floatingTexts.push({ x: cx, y: cy, text: `+${ptsEarned}`, life: 60, maxLife: 60 });
        state.roundScore += ptsEarned;
        pulseScoreboard();
    }

    // Fast dissolve sequence for explosions
    state.inputLocked = true;
    state.dissolveTimer = 10;
    state.dissolvingCells = affected;
    updateUI();
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
            grid[i][c] = { 
                type: activeTypes[Math.floor(Math.random() * activeTypes.length)], 
                yOffset: -canvas.height - (i * tileSize),
                vy: 0
            };
        }
    }
    ensurePossibleMatch();
}

function updatePhysics() {
    // 1. Process Dissolve Timers (Flare -> Steam)
    if (state.inputLocked && state.dissolveTimer > 0) {
        state.dissolveTimer--;
        if (state.dissolveTimer <= 0) {
            state.dissolvingCells.forEach(s => {
                let cx = s.c * tileSize + tileSize/2;
                let cy = s.r * tileSize + tileSize/2;
                for(let i=0; i<4; i++) {
                    particles.push(createSteamParticle(cx, cy));
                }
                grid[s.r][s.c] = null;
            });
            state.dissolvingCells = [];
            state.selection = [];
            processGravity();
            updateUI();
            state.inputLocked = false;
        }
    }

    // 2. Heavy Stone Bounce (Gravity)
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let cell = grid[r][c];
            if (cell && cell.yOffset < 0) {
                cell.vy = (cell.vy || 0) + 1.2; 
                cell.yOffset += cell.vy;
                if (cell.yOffset >= 0) {
                    if (cell.vy > 4) {
                        cell.vy = -cell.vy * 0.35; // Bounce magnitude
                        cell.yOffset = -1; 
                    } else {
                        cell.yOffset = 0;
                        cell.vy = 0;
                    }
                }
            }
        }
    }

    // 3. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.type === 'steam') p.size += 0.4; // Steam expands
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
    
    // 4. Update Floating Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y -= 1.5; 
        ft.life--;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    if (shakeFrames > 0) shakeFrames--;
}

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    
    // Screen Shake Effect
    if (shakeFrames > 0) {
        let dx = (Math.random() - 0.5) * 12;
        let dy = (Math.random() - 0.5) * 12;
        ctx.translate(dx, dy);
    }

    // Draw active selection chain lines
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

    const padding = tileSize * 0.1;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let cell = grid[r][c];
            if (!cell) continue;

            let x = c * tileSize;
            let y = r * tileSize + (cell.yOffset || 0);

            let isDissolving = state.dissolvingCells.find(s => s.r === r && s.c === c);
            let isSelected = state.selection.find(s => s.r === r && s.c === c);
            let img;

            if (cell.type === 'STAR') {
                img = ASSETS.star;
            } else {
                img = (isSelected || isDissolving) ? ASSETS.glow[cell.type] : ASSETS.normal[cell.type];
            }

            if (img && img.complete) {
                ctx.drawImage(img, x + padding, y + padding, tileSize - padding*2, tileSize - padding*2);
                
                // Draw Match Flare overlay if dissolving
                if (isDissolving) {
                    let alpha = state.dissolveTimer / 25; 
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                    ctx.beginPath();
                    ctx.arc(x + tileSize/2, y + tileSize/2, (tileSize - padding*2)/2, 0, Math.PI*2);
                    ctx.fill();
                }
            }
        }
    }

    // Draw Particles
    particles.forEach(p => {
        if (p.type === 'sparkle') {
            let alpha = p.life / p.maxLife;
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
        } else if (p.type === 'steam') {
            let alpha = (p.life / p.maxLife) * 0.6;
            ctx.fillStyle = `rgba(220, 220, 220, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
        } else if (p.type === 'blast') {
            let alpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    });

    // Draw Floating Text
    floatingTexts.forEach(ft => {
        let alpha = ft.life / ft.maxLife;
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
        ctx.font = "bold 26px Georgia";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 6;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0; // reset
    });

    ctx.restore();
}

function gameLoop() {
    if (state.playing) {
        updatePhysics();
        drawGrid();
        requestAnimationFrame(gameLoop);
    }
}
