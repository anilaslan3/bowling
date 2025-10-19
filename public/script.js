import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- SUNUCU BAĞLANTISI ---
const socket = io();

// --- HTML ELEMENTLERİ ---
const canvas = document.getElementById('game-canvas');
const scoreElement = document.getElementById('scoreboard');
const powerBarContainer = document.getElementById('power-bar-container');
const powerBar = document.getElementById('power-bar');
const infoText = document.getElementById('info-text');
const resetButton = document.getElementById('reset-button');

// --- OYUN DEĞİŞKENLERİ ---
let myTurn = false;
let myPlayerId = null;
let score = 0;
let gameState = 'WAITING_FOR_GAME';
let powerValue = 0;
let powerDirection = 1;
let ball, ballBody;
let opponentBall, opponentBallBody; // Rakip topu için
const pins = [];
const pinBodies = [];
const pinInitialPositions = [];

// --- THREE.JS & CANNON.JS KURULUMU ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
camera.position.set(0, 5, 15);
camera.lookAt(0, 0, 0);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(0, 10, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

// --- FONKSİYONLAR (ÖNCEKİ KODDAN EKSİKSİZ KOPYALANMALI) ---

function createLane() {
    const laneGeometry = new THREE.BoxGeometry(8, 0.2, 30);
    const laneMaterial = new THREE.MeshStandardMaterial({ color: 0x664422 });
    const lane = new THREE.Mesh(laneGeometry, laneMaterial);
    lane.receiveShadow = true;
    lane.position.y = -0.1;
    scene.add(lane);
    const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
}

function createPins() {
    const pinGeometry = new THREE.CylinderGeometry(0.2, 0.1, 1.5, 16);
    const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pinShape = new CANNON.Cylinder(0.2, 0.1, 1.5, 16);
    const pinPositions = [
        [0, 0.75, 0], [-0.5, 0.75, -1], [0.5, 0.75, -1], [-1, 0.75, -2], [0, 0.75, -2], [1, 0.75, -2],
        [-1.5, 0.75, -3], [-0.5, 0.75, -3], [0.5, 0.75, -3], [1.5, 0.75, -3],
    ];
    pinPositions.forEach(pos => {
        const pin = new THREE.Mesh(pinGeometry, pinMaterial);
        pin.castShadow = true;
        pin.position.set(pos[0], pos[1], pos[2]);
        scene.add(pin);
        pins.push(pin);
        const pinBody = new CANNON.Body({ mass: 1, shape: pinShape });
        pinBody.position.copy(pin.position);
        pinInitialPositions.push(pin.position.clone());
        pinBodies.push(pinBody);
        world.addBody(pinBody);
    });
}

function createBall(isOpponent = false) {
    const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: isOpponent ? 0xff3333 : 0x2222ff });
    const newBall = new THREE.Mesh(ballGeometry, ballMaterial);
    newBall.castShadow = true;
    scene.add(newBall);
    const newBallBody = new CANNON.Body({ mass: 10, shape: new CANNON.Sphere(0.5) });
    world.addBody(newBallBody);
    return { ball: newBall, body: newBallBody };
}

function initGame() {
    createLane();
    createPins();
    const myBallData = createBall(false);
    ball = myBallData.ball;
    ballBody = myBallData.body;
    const opponentBallData = createBall(true);
    opponentBall = opponentBallData.ball;
    opponentBallBody = opponentBallData.body;
    resetRound();
}

function resetRound() {
    gameState = myTurn ? 'AIMING' : 'WAITING_FOR_OPPONENT';
    infoText.innerHTML = myTurn ? "<p>Sıra sende! Konumunu ayarla (← → ve ENTER).</p>" : "<p>Rakibin sırası bekleniyor...</p>";

    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    ballBody.position.set(0, 0.5, 12);
    
    opponentBallBody.velocity.set(0, 0, 0);
    opponentBallBody.angularVelocity.set(0, 0, 0);
    opponentBallBody.position.set(0, 0.5, 12);
    opponentBall.visible = false;
    
    pinBodies.forEach((pinBody, index) => {
        pinBody.velocity.set(0, 0, 0);
        pinBody.angularVelocity.set(0, 0, 0);
        pinBody.position.copy(pinInitialPositions[index]);
        pinBody.quaternion.set(0, 0, 0, 1);
    });
}

// --- KLAVYE KONTROLLERİ ---
window.addEventListener('keydown', (event) => {
    if (!myTurn) return;
    if (gameState === 'AIMING') {
        let newX = ballBody.position.x;
        if (event.key === 'ArrowLeft' && newX > -3.5) newX -= 0.2;
        if (event.key === 'ArrowRight' && newX < 3.5) newX += 0.2;
        ballBody.position.x = newX;
        socket.emit('playerMove', { type: 'aim', position: { x: newX, y: ballBody.position.y, z: ballBody.position.z } });
        if (event.key === 'Enter') {
            gameState = 'POWERING';
            powerBarContainer.style.display = 'block';
            infoText.innerHTML = `<p>Gücü Ayarlamak İçin: SPACE</p>`;
        }
    } else if (gameState === 'POWERING') {
        if (event.key === ' ') {
            gameState = 'THROWING';
            powerBarContainer.style.display = 'none';
            infoText.style.display = 'none';
            const force = new CANNON.Vec3(0, 0, -powerValue * 1.5);
            ballBody.applyLocalImpulse(force, new CANNON.Vec3(0, 0, 0));
            socket.emit('playerMove', { type: 'throw', force: { x: force.x, y: force.y, z: force.z } });
            myTurn = false;
            setTimeout(() => {
                socket.emit('turnChange', {});
            }, 5000);
        }
    }
});

// --- SUNUCU OLAYLARI ---
socket.on('connect', () => { myPlayerId = socket.id; });
socket.on('waiting', (data) => { infoText.innerHTML = `<p>${data.message}</p>`; });
socket.on('gameStart', (data) => {
    myTurn = (data.startingPlayer === myPlayerId);
    initGame();
});
socket.on('opponentMove', (data) => {
    if (data.type === 'aim') {
        opponentBall.visible = true;
        opponentBallBody.position.copy(data.position);
    }
    if (data.type === 'throw') {
        opponentBallBody.applyLocalImpulse(new CANNON.Vec3().copy(data.force), new CANNON.Vec3(0, 0, 0));
    }
});
socket.on('newTurn', () => { myTurn = !myTurn; resetRound(); });
socket.on('opponentDisconnect', (data) => {
    infoText.innerHTML = `<p>${data.message}</p>`;
    myTurn = false;
    gameState = 'GAME_OVER';
});

// --- ANİMASYON DÖNGÜSÜ ---
function animate() {
    requestAnimationFrame(animate);
    world.step(1 / 60);

    if (gameState === 'POWERING') {
        powerValue += 2 * powerDirection;
        if (powerValue >= 100) powerDirection = -1;
        if (powerValue <= 0) powerDirection = 1;
        powerBar.style.height = `${powerValue}%`;
    }

    if (ball) ball.position.copy(ballBody.position);
    if (opponentBall) opponentBall.position.copy(opponentBallBody.position);
    for (let i = 0; i < pins.length; i++) {
        pins[i].position.copy(pinBodies[i].position);
        pins[i].quaternion.copy(pinBodies[i].quaternion);
    }
    renderer.render(scene, camera);
}
animate();