// client.js

// Ammo.js kütüphanesi yüklendiğinde ve hazır olduğunda bu fonksiyon çalışacak.
Ammo().then(function (AmmoLib) {
    // Yükleme tamamlandı, şimdi oyunu başlatabiliriz.
    start(AmmoLib);
});


function start(Ammo) {
    // --- TEMEL DEĞİŞKENLER ve OYUN DURUMU ---
    const socket = io();
    let physicsWorld, scene, camera, renderer, clock;
    let rigidBodies = []; // Fiziksel objeleri saklayacak dizi
    let myBall;
    let gameState = 'PLACING'; // Olası durumlar: PLACING, AIMING, THROWING, WAITING
    
    // UI Elementleri
    const statusText = document.getElementById('status');
    const powerBarContainer = document.getElementById('power-bar-container');
    const powerBar = document.getElementById('power-bar');
    const resetButton = document.getElementById('resetButton');

    // --- FİZİK DÜNYASI KURULUMU ---
    function setupPhysicsWorld() {
        let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        let dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        let broadphase = new Ammo.btDbvtBroadphase();
        let solver = new Ammo.btSequentialImpulseConstraintSolver();
        physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
        physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));
    }

    // --- 3D SAHNE KURULUMU ---
    function setupGraphics() {
        clock = new THREE.Clock();
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x2a2a2a);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 8, 25);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.getElementById('game-container').appendChild(renderer.domElement);

        // Işıklandırma
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        scene.add(dirLight);
    }

    // --- OYUN NESNELERİNİ OLUŞTURMA ---
    function createGameObjects() {
        // Zemin (Bowling Yolu)
        const pos = new THREE.Vector3(0, -0.25, 0);
        const scale = new THREE.Vector3(4, 0.5, 30);
        const quat = new THREE.Quaternion(0, 0, 0, 1);
        const mass = 0; // Kütlesi 0 olan objeler sabittir
        const ground = createBox(pos, quat, scale, mass, 0x8B4513);
        ground.mesh.castShadow = true;
        ground.mesh.receiveShadow = true;

        // Bowling Topu (Benim topum)
        myBall = createBall();

        // Lobutlar
        createPins();
    }

    // Lobutları oluşturan ve yerleştiren fonksiyon
    function createPins() {
        const pinPositions = [
            [0, 0],
            [-0.75, -1.5], [0.75, -1.5],
            [-1.5, -3], [0, -3], [1.5, -3],
            [-2.25, -4.5], [-0.75, -4.5], [0.75, -4.5], [2.25, -4.5]
        ];

        pinPositions.forEach(p => {
            const pos = new THREE.Vector3(p[0], 1, -10 + p[1]);
            const quat = new THREE.Quaternion(0, 0, 0, 1);
            const mass = 0.2;
            const pin = createCylinder(pos, quat, new THREE.Vector3(0.2, 2, 0.2), mass, 0xffffff);
            pin.mesh.castShadow = true;
            pin.mesh.receiveShadow = true;
        });
    }

    // Bowling Topu oluşturan fonksiyon
    function createBall() {
        const pos = new THREE.Vector3(0, 0.5, 12);
        const radius = 0.5;
        const quat = new THREE.Quaternion(0, 0, 0, 1);
        const mass = 3;
        const ball = createSphere(pos, quat, radius, mass, 0x111111);
        ball.mesh.castShadow = true;
        ball.mesh.receiveShadow = true;
        
        ball.body.setActivationState(4); // DISABLE_DEACTIVATION

        return ball;
    }

    // --- YARDIMCI FİZİK FONKSİYONLARI ---
    function createBox(pos, quat, scale, mass, color) {
        const shape = new THREE.BoxGeometry(scale.x, scale.y, scale.z);
        const material = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(shape, material);
        mesh.position.copy(pos);
        mesh.quaternion.copy(quat);
        scene.add(mesh);

        const ammoShape = new Ammo.btBoxShape(new Ammo.btVector3(scale.x * 0.5, scale.y * 0.5, scale.z * 0.5));
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
        transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
        const motionState = new Ammo.btDefaultMotionState(transform);
        const localInertia = new Ammo.btVector3(0, 0, 0);
        ammoShape.calculateLocalInertia(mass, localInertia);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, ammoShape, localInertia);
        const body = new Ammo.btRigidBody(rbInfo);
        physicsWorld.addRigidBody(body);
        
        const obj = { mesh, body };
        rigidBodies.push(obj);
        return obj;
    }

    function createSphere(pos, quat, radius, mass, color) {
        const shape = new THREE.SphereGeometry(radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(shape, material);
        mesh.position.copy(pos);
        scene.add(mesh);
    
        const ammoShape = new Ammo.btSphereShape(radius);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
        const motionState = new Ammo.btDefaultMotionState(transform);
        const localInertia = new Ammo.btVector3(0, 0, 0);
        ammoShape.calculateLocalInertia(mass, localInertia);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, ammoShape, localInertia);
        const body = new Ammo.btRigidBody(rbInfo);
        physicsWorld.addRigidBody(body);
    
        const obj = { mesh, body, initialPos: pos.clone() };
        rigidBodies.push(obj);
        return obj;
    }
    
    function createCylinder(pos, quat, scale, mass, color) {
        const shape = new THREE.CylinderGeometry(scale.x, scale.x, scale.y, 32);
        const material = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(shape, material);
        mesh.position.copy(pos);
        scene.add(mesh);

        const ammoShape = new Ammo.btCylinderShape(new Ammo.btVector3(scale.x, scale.y * 0.5, scale.x));
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
        const motionState = new Ammo.btDefaultMotionState(transform);
        const localInertia = new Ammo.btVector3(0, 0, 0);
        ammoShape.calculateLocalInertia(mass, localInertia);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, ammoShape, localInertia);
        const body = new Ammo.btRigidBody(rbInfo);
        physicsWorld.addRigidBody(body);

        const obj = { mesh, body, initialPos: pos.clone() };
        rigidBodies.push(obj);
        return obj;
    }
    
    // --- GÜNCELLEME DÖNGÜSÜ ---
    const tmpTransform = new Ammo.btTransform(); // Performans için döngü dışında oluştur
    function updatePhysics(deltaTime) {
        physicsWorld.stepSimulation(deltaTime, 10);
        for (let i = 0; i < rigidBodies.length; i++) {
            const obj = rigidBodies[i];
            const ms = obj.body.getMotionState();
            if (ms) {
                ms.getWorldTransform(tmpTransform);
                const pos = tmpTransform.getOrigin();
                const quat = tmpTransform.getRotation();
                obj.mesh.position.set(pos.x(), pos.y(), pos.z());
                obj.mesh.quaternion.set(quat.x(), quat.y(), quat.z(), quat.w());
            }
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        const deltaTime = clock.getDelta();
        updatePhysics(deltaTime);
        renderer.render(scene, camera);
    }

    // --- OYUN MANTIĞI VE KONTROLLER ---
    let power = 0;
    let powerInterval;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('mousemove', (event) => {
        if (gameState !== 'PLACING') return;

        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObject(scene.children[1]); 
        if (intersects.length > 0) {
            let xPos = intersects[0].point.x;
            xPos = Math.max(-1.5, Math.min(1.5, xPos)); 
            myBall.mesh.position.x = xPos;
            const transform = myBall.body.getWorldTransform();
            transform.getOrigin().setX(xPos);
            myBall.body.setWorldTransform(transform);
        }
    });

    window.addEventListener('mousedown', () => {
        if (gameState !== 'PLACING') return;
        
        gameState = 'AIMING';
        statusText.innerText = 'Gücü belirlemek için bırak!';
        powerBarContainer.style.display = 'block';
        power = 0;
        powerInterval = setInterval(() => {
            power += 2;
            if (power > 100) power = 0;
            powerBar.style.height = power + '%';
        }, 20);
    });

    window.addEventListener('mouseup', () => {
        if (gameState !== 'AIMING') return;

        clearInterval(powerInterval);
        gameState = 'THROWING';
        statusText.innerText = 'Atış yapıldı!';
        powerBarContainer.style.display = 'none';

        myBall.body.setActivationState(1);
        const throwForce = power * 0.4;
        
        const impulse = new Ammo.btVector3(0, 0, -throwForce);
        const pos = myBall.body.getWorldTransform().getOrigin();
        myBall.body.applyCentralImpulse(impulse);
        
        const throwData = {
            position: { x: pos.x(), y: pos.y(), z: pos.z() },
            impulse: { x: 0, y: 0, z: -throwForce }
        };
        socket.emit('throwBall', throwData);

        setTimeout(() => {
            gameState = 'WAITING';
            statusText.innerText = 'Sıfırlamak için butona bas.';
            resetButton.style.display = 'block';
        }, 5000);
    });

    resetButton.addEventListener('click', () => {
        socket.emit('resetPins');
    });

    function resetAllPins() {
        rigidBodies.forEach(obj => {
            if (obj.initialPos) {
                obj.body.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
                obj.body.setAngularVelocity(new Ammo.btVector3(0, 0, 0));

                const transform = obj.body.getWorldTransform();
                transform.setOrigin(new Ammo.btVector3(obj.initialPos.x, obj.initialPos.y, obj.initialPos.z));
                transform.setRotation(new Ammo.btQuaternion(0, 0, 0, 1));
                obj.body.setWorldTransform(transform);
                obj.body.getMotionState().setWorldTransform(transform);
            }
        });
        
        myBall.body.setActivationState(4);

        gameState = 'PLACING';
        statusText.innerText = 'Topu yerleştir, fırlatmak için tıkla ve basılı tut.';
        resetButton.style.display = 'none';
    }


    // --- SOCKET.IO OLAYLARI ---
    const otherPlayers = {};

    socket.on('playerThrewBall', ({ playerId, data }) => {
        console.log(`${playerId} atış yaptı.`);
        // Bu prototipte diğer oyuncuların topları henüz oluşturulmadı.
    });

    socket.on('resetPinsBroadcast', () => {
        console.log('Tüm lobutlar sıfırlanıyor.');
        resetAllPins();
    });


    // --- BAŞLATMA ---
    setupPhysicsWorld();
    setupGraphics();
    createGameObjects();
    animate();
}