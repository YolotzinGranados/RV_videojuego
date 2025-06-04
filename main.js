import * as THREE from "https://esm.sh/three@0.160.1";
import { GLTFLoader } from "https://esm.sh/three@0.160.1/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "https://esm.sh/three@0.160.1/examples/jsm/loaders/RGBELoader.js";
import { VRButton } from "https://esm.sh/three@0.160.1/examples/jsm/webxr/VRButton.js";


// Variables globales
let scene, camera, renderer, personaje, mixer, acciones = {};
let teclasPresionadas = {};
let enElAire = false;
let juegoIniciado = false;
let enemigo, enemigoMixer, enemigoAcciones = {};
let rutaEnemigo = [];
let indiceRuta = 0;
let tiempoSiguienteMovimiento = 0;
let paredesLaberinto; // Referencia al grupo que contiene las paredes del laberinto
let colisionDebug = false; // Para depuración visual de las colisiones
let animManager;
let velocidadVertical = 0;
const gravedad = 0.05;
const fuerzaSalto = 0.15;
let puedeSaltar = true;
let cameraRig = new THREE.Group();



const clock = new THREE.Clock();
const velocidadMovimiento = 0.1;
const velocidadRotacion = 0.05;
const tamanoCelda = 5;
const tamanoLaberinto = 15;
let juegoGanado = false;
let laberintoData;
const contadorDiv = document.createElement("div");
contadorDiv.style.position = "absolute";
contadorDiv.style.right = "10px";
contadorDiv.style.top = "10px";
contadorDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
contadorDiv.style.color = "white";
contadorDiv.style.padding = "10px";
contadorDiv.style.fontSize = "20px";
document.body.appendChild(contadorDiv);

let contador = 0;
contadorDiv.textContent = `Monedas: ${contador}`;

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));



// Monedas
const monedas = [];
const monedaGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
const monedaMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });


function generarMonedas(cantidad) {
  for (let i = 0; i < cantidad; i++) {
    const moneda = new THREE.Mesh(monedaGeometry, monedaMaterial);
    moneda.position.set(
      Math.random() * 100 - 50, // X aleatoria
      0.1,                     // Flotando un poco sobre el piso
      Math.random() * 100 - 50 // Z aleatoria
    );
    monedas.push(moneda);
    scene.add(moneda);
  }
}

class AnimacionManager {
  constructor(modelo) {
    this.modelo = modelo;
    this.mixer = new THREE.AnimationMixer(modelo);
    this.acciones = {};
    this.animacionActual = null;
    this.animacionAnterior = null;
    this.enTransicion = false;
    this.duracionFade = 0.2;
  }

  cargarAnimaciones(animaciones) {
    animaciones.forEach(anim => {
      const clip = anim.clip;
      const accion = this.mixer.clipAction(clip);
      
      // Configurar el tipo de bucle según la animación
      if (anim.tipo === 'repetir') {
        accion.setLoop(THREE.LoopRepeat);
      } else if (anim.tipo === 'una_vez') {
        accion.setLoop(THREE.LoopOnce);
        accion.clampWhenFinished = true;
      }
      
      this.acciones[anim.nombre] = accion;
    });
  }

  reproducirAnimacion(nombre, fuerza = false) {
    // Si ya está reproduciendo esta animación y no forzamos el cambio
    if (this.animacionActual === nombre && !fuerza) return;
    
    const accion = this.acciones[nombre];
    if (!accion) {
      console.warn(`Animación ${nombre} no encontrada`);
      return;
    }

    this.animacionAnterior = this.animacionActual;
    this.animacionActual = nombre;
    this.enTransicion = true;

    // Detener animación anterior con fade out
    if (this.animacionAnterior && this.acciones[this.animacionAnterior]) {
      this.acciones[this.animacionAnterior].fadeOut(this.duracionFade);
    }

    // Configurar y reproducir nueva animación
    accion.reset();
    accion.fadeIn(this.duracionFade);
    accion.play();

    // Para animaciones de un solo ciclo, configurar un evento de finalización
    if (accion.getLoop() === THREE.LoopOnce) {
      accion.addEventListener('finished', () => this.onAnimacionTerminada(nombre));
    }
  }

  onAnimacionTerminada(nombre) {
    if (this.animacionActual === nombre) {
      this.enTransicion = false;
      // Aquí puedes agregar lógica para qué animación reproducir después
    }
  }

  actualizar(delta) {
    this.mixer.update(delta);
  }
}

// Configuración inicial
function init() {
  // Crear escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaaaaaa);

  // Cargar HDRI
  const rgbeLoader = new RGBELoader();
  rgbeLoader.load("assets/texturas/ambiente.hdr", function (texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.background = texture;
  });

  // Configurar cámara en tercera persona
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );


  // Luces
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true; // Habilitar proyección de sombras
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
 scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

  // Mostrar interfaz de inicio
  mostrarInterfazInicio();

  // Event listeners
  setupEventListeners();

  // Animación
  animate();
}

// Interfaz de inicio
function mostrarInterfazInicio() {
  const overlay = document.createElement('div');
  overlay.id = 'inicio-overlay';
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(9, 1, 105, 0.7)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.flexDirection = 'column';
  overlay.style.zIndex = '100';

  const titulo = document.createElement('h1');
  titulo.textContent = 'Laberinto 3D';
  titulo.style.color = 'white';
  titulo.style.fontSize = '3em';
  titulo.style.marginBottom = '30px';

  const botonJugar = document.createElement('button');
  botonJugar.textContent = 'Jugar';
  botonJugar.style.padding = '15px 30px';
  botonJugar.style.fontSize = '1.5em';
  botonJugar.style.cursor = 'pointer';
  botonJugar.style.backgroundColor = '#4CAF50';
  botonJugar.style.color = 'white';
  botonJugar.style.border = 'none';
  botonJugar.style.borderRadius = '5px';

  botonJugar.addEventListener('click', () => {
    overlay.remove();
    juegoIniciado = true;
    // Crear escenario y cargar personaje
    crearEscenario();
    cargarPersonaje();
  });

  overlay.appendChild(titulo);
  overlay.appendChild(botonJugar);
  document.body.appendChild(overlay);
}

// Crear escenario (suelo, paredes y laberinto)
function crearEscenario() {
  // Texturas
  const textureLoader = new THREE.TextureLoader();

  generarMonedas(50); // Genera 20 monedas


  // Piso
  const floorTexture = textureLoader.load("assets/texturas/piso.jpg");
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(10, 10);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ map: floorTexture })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Paredes exteriores
  const wallTexture = textureLoader.load("assets/texturas/pared.jpg");
  wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
  wallTexture.repeat.set(5, 1);

  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });

  const wallThickness = 1;
  const wallHeight = 5;
  const floorSize = 100;

  const wallFront = new THREE.Mesh(
    new THREE.BoxGeometry(floorSize, wallHeight, wallThickness),
    wallMaterial
  );
  wallFront.position.set(0, wallHeight / 2, -floorSize / 2);
  wallFront.receiveShadow = true;
  wallFront.castShadow = true;
  scene.add(wallFront);

  const wallBack = new THREE.Mesh(
    new THREE.BoxGeometry(floorSize, wallHeight, wallThickness),
    wallMaterial
  );
  wallBack.position.set(0, wallHeight / 2, floorSize / 2);
  wallBack.receiveShadow = true;
  wallBack.castShadow = true;
  scene.add(wallBack);

  const wallLeft = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, floorSize),
    wallMaterial
  );
  wallLeft.position.set(-floorSize / 2, wallHeight / 2, 0);
  wallLeft.receiveShadow = true;
  wallLeft.castShadow = true;
  scene.add(wallLeft);

  const wallRight = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, floorSize),
    wallMaterial
  );
  wallRight.position.set(floorSize / 2, wallHeight / 2, 0);
  wallRight.receiveShadow = true;
  wallRight.castShadow = true;
  scene.add(wallRight);

  // Textura para las paredes del laberinto
  const paredTexture = textureLoader.load("assets/texturas/pared_laberinto.jpg");
  paredTexture.wrapS = THREE.RepeatWrapping;
  paredTexture.wrapT = THREE.RepeatWrapping;
  paredTexture.repeat.set(1, 1);

  const paredLaberintoMaterial = new THREE.MeshStandardMaterial({ 
    map: paredTexture,
    roughness: 0.7,
    metalness: 0.1,
    bumpMap: paredTexture,
    bumpScale: 0.05
  });

  // Generar laberinto
  laberintoData = generarLaberinto(tamanoLaberinto, tamanoLaberinto);
  const laberintoGrid = laberintoData.grid;

  // Crear paredes del laberinto
  paredesLaberinto = new THREE.Group();
  paredesLaberinto.name = "paredesLaberinto"; // Nombre para identificar el grupo
  
  for (let y = 0; y < tamanoLaberinto; y++) {
    for (let x = 0; x < tamanoLaberinto; x++) {
      if (laberintoGrid[y][x] === 1) {
        const pared = new THREE.Mesh(
          new THREE.BoxGeometry(tamanoCelda, wallHeight, tamanoCelda),
          paredLaberintoMaterial
        );
        pared.castShadow = true;
        pared.receiveShadow = true;
        pared.position.set(
          (x - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2,
          wallHeight / 2,
          (y - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2
        );
        // Agregar propiedades para identificación
        pared.userData.tipo = "pared";
        pared.userData.gridX = x;
        pared.userData.gridY = y;
        paredesLaberinto.add(pared);
      }
    }
  }
  scene.add(paredesLaberinto);

  // Marcador en el centro
  const centroMarker = new THREE.Mesh(
    new THREE.BoxGeometry(tamanoCelda, 0.1, tamanoCelda),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
  );
  centroMarker.position.set(0, 0.05, 0);
  scene.add(centroMarker);
}


// Generador de laberinto mejorado
function generarLaberinto(ancho, alto) {
  const grid = Array(alto).fill().map(() => Array(ancho).fill(1));

  function esValida(x, y) {
    return x >= 0 && x < ancho && y >= 0 && y < alto;
  }
  
  const direcciones = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  function generar(x, y) {
    grid[y][x] = 0;
    
    const dirs = [...direcciones].sort(() => Math.random() - 0.5);
    
    for (const [dx, dy] of dirs) {
      const nx = x + dx * 2;
      const ny = y + dy * 2;
      
      if (esValida(nx, ny)) {
        if (grid[ny][nx] === 1) {
          grid[y + dy][x + dx] = 0;
          generar(nx, ny);
        }
      }
    }
  }

  // Punto de inicio fijo (1,1)
  const inicioX = 1;
  const inicioY = 1;
  generar(inicioX, inicioY);
  
  // Asegurar entrada y salida
  grid[inicioY][inicioX] = 0; // Celda de inicio
  grid[inicioY][inicioX-1] = 0; // Pasillo de entrada
  
  return {
    grid: grid,
    inicio: { x: inicioX, y: inicioY },
    entrada: { x: inicioX-1, y: inicioY }
  };
}

function cargarEnemigo() {
  const loader = new GLTFLoader();
  loader.load(
    "assets/modelos/enemigo.glb", // Ruta a tu modelo de enemigo
    (gltf) => {
      enemigo = gltf.scene;
      enemigo.scale.set(0.5, 0.5, 0.5);
      enemigo.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Posicionar enemigo en una ubicación aleatoria del laberinto
      posicionarEnemigoAleatorio();
      
      scene.add(enemigo);

      // Configurar animaciones del enemigo
      if (gltf.animations && gltf.animations.length) {
        enemigoMixer = new THREE.AnimationMixer(enemigo);
        gltf.animations.forEach((clip) => {
          enemigoAcciones[clip.name] = enemigoMixer.clipAction(clip);
          if (clip.name.toLowerCase().includes('walk')) {
            enemigoAcciones[clip.name].play();
          }
        });
      }

      // Generar ruta de patrulla
      generarRutaPatrulla();
    },
    undefined,
    (err) => console.error("Error cargando enemigo:", err)
  );
}

function posicionarEnemigoAleatorio() {
  if (!enemigo || !laberintoData) return;

  // Encontrar una posición aleatoria en el laberinto que sea un pasillo (0)
  let x, y;
  do {
    x = Math.floor(Math.random() * tamanoLaberinto);
    y = Math.floor(Math.random() * tamanoLaberinto);
  } while (laberintoData.grid[y][x] !== 0 || 
          (x === laberintoData.inicio.x && y === laberintoData.inicio.y));

  const posX = (x - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2;
  const posZ = (y - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2;

  enemigo.position.set(posX, 0, posZ);
  enemigo.rotation.y = Math.PI * Math.random() * 2;
}

function generarRutaPatrulla() {
  if (!laberintoData || !enemigo) return;

  rutaEnemigo = [];
  const maxPuntos = 5;
  
  // Convertir posición actual a coordenadas de grid
  let currentX = Math.round((enemigo.position.x / tamanoCelda) + tamanoLaberinto/2 - 0.5);
  let currentY = Math.round((enemigo.position.z / tamanoCelda) + tamanoLaberinto/2 - 0.5);

  rutaEnemigo.push({x: currentX, y: currentY});

  // Generar puntos adicionales alcanzables
  for (let i = 0; i < maxPuntos - 1; i++) {
    const direcciones = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const dirs = [...direcciones].sort(() => Math.random() - 0.5);
    
    for (const [dx, dy] of dirs) {
      const nx = currentX + dx;
      const ny = currentY + dy;
      
      if (nx >= 0 && nx < tamanoLaberinto && 
          ny >= 0 && ny < tamanoLaberinto &&
          laberintoData.grid[ny][nx] === 0) {
        currentX = nx;
        currentY = ny;
        rutaEnemigo.push({x: currentX, y: currentY});
        break;
      }
    }
  }
}

function actualizarEnemigo(delta) {
  if (!enemigo || !enemigoMixer || rutaEnemigo.length < 2) return;
  
  // Actualizar el mixer de animación del enemigo
  enemigoMixer.update(delta);

  tiempoSiguienteMovimiento -= delta;
  
  if (tiempoSiguienteMovimiento <= 0) {
    // Mover al siguiente punto de la ruta
    indiceRuta = (indiceRuta + 1) % rutaEnemigo.length;
    tiempoSiguienteMovimiento = 2 + Math.random() * 3; // Tiempo hasta el próximo movimiento
  }

  // Obtener posición actual y objetivo
  const targetIndex = (indiceRuta + 1) % rutaEnemigo.length;
  const target = rutaEnemigo[targetIndex];
  const current = rutaEnemigo[indiceRuta];

  // Calcular posición intermedia basada en el tiempo
  const progress = 1 - (tiempoSiguienteMovimiento / (2 + Math.random() * 3));
  
  const posX = current.x + (target.x - current.x) * progress;
  const posZ = current.y + (target.y - current.y) * progress;

  // Convertir a coordenadas del mundo
  const worldX = (posX - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2;
  const worldZ = (posZ - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2;

  // Actualizar posición y rotación
  enemigo.position.x = worldX;
  enemigo.position.z = worldZ;
  
  // Rotar hacia la dirección del movimiento
  if (progress > 0.1 && progress < 0.9) {
    const angle = Math.atan2(target.x - current.x, target.y - current.y);
    enemigo.rotation.y = -angle;
  }

  // Verificar colisión con el jugador
  if (personaje && enemigo) {
    const distancia = personaje.position.distanceTo(enemigo.position);
    if (distancia < 1.5) { // Radio de colisión
      perderJuego();
    }
  }
}

function perderJuego() {
  if (!juegoIniciado) return; // Evitar activar múltiples veces
  
  const overlay = document.createElement('div');
  overlay.id = 'perder-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.flexDirection = 'column';
  overlay.style.zIndex = '1000';
  overlay.style.color = 'white';
  overlay.style.fontFamily = 'Arial, sans-serif';
  
  const titulo = document.createElement('h1');
  titulo.textContent = '¡Perdiste!';
  titulo.style.fontSize = '4em';
  titulo.style.marginBottom = '20px';
  titulo.style.color = '#FF0000';
  
  const mensaje = document.createElement('p');
  mensaje.textContent = 'El enemigo te ha atrapado';
  mensaje.style.fontSize = '1.5em';
  mensaje.style.marginBottom = '40px';
  
  const botonReiniciar = document.createElement('button');
  botonReiniciar.textContent = 'Reintentar';
  botonReiniciar.style.padding = '15px 30px';
  botonReiniciar.style.fontSize = '1.2em';
  botonReiniciar.style.backgroundColor = '#FF0000';
  botonReiniciar.style.color = 'white';
  botonReiniciar.style.border = 'none';
  botonReiniciar.style.borderRadius = '5px';
  botonReiniciar.style.cursor = 'pointer';
  
  botonReiniciar.addEventListener('click', () => {
    location.reload();
  });
  
  overlay.appendChild(titulo);
  overlay.appendChild(mensaje);
  overlay.appendChild(botonReiniciar);
  document.body.appendChild(overlay);
  
  juegoIniciado = false;
}

// Cargar personaje
async function cargarPersonaje() {
  const loader = new GLTFLoader();
  
  try {
    console.log("Iniciando carga del personaje...");
    const gltf = await loader.loadAsync("assets/animaciones/MapacheCaminando.glb");
    console.log("Modelo cargado correctamente");
    
    const model = gltf.scene;
    model.scale.set(0.5, 0.5, 0.5);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    personaje = new THREE.Group();
    personaje.add(model);
    scene.add(personaje);
    
    // Posicionar cámara
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    posicionarJugadorEnEntrada();

    // Crear el administrador de animaciones
    animManager = new AnimacionManager(model);
    
    // Cargar animaciones (esto deberías adaptarlo a tus archivos reales)
    const animaciones = await cargarTodasLasAnimaciones();
    animManager.cargarAnimaciones(animaciones);
    
    // Reproducir animación inicial
    animManager.reproducirAnimacion('MapacheCaminando');
    
    // Cargar enemigo después de que el personaje esté listo
    cargarEnemigo();
    
  } catch (err) {
    console.error("Error cargando personaje:", err);
  }
}

async function cargarTodasLasAnimaciones() {
  const loader = new GLTFLoader();
  const animaciones = [];
  
  try {
    // Animación Caminar
    const walkAnim = await loader.loadAsync("assets/animaciones/MapacheCaminando.glb");
    animaciones.push({
      nombre: 'MapacheCaminando',
      clip: walkAnim.animations[0],
      tipo: 'repetir'
    });

    // Animación Correr
    const runAnim = await loader.loadAsync("assets/animaciones/MapacheCorriendo.glb");
    animaciones.push({
      nombre: 'MapacheCorriendo', 
      clip: runAnim.animations[0],
      tipo: 'repetir'
    });

    // Animación Saltar
    const jumpAnim = await loader.loadAsync("assets/animaciones/MapacheSaltando.glb");
    animaciones.push({
      nombre: 'MapacheSaltando',
      clip: jumpAnim.animations[0], 
      tipo: 'una_vez'
    });

  } catch (err) {
    console.error("Error cargando animaciones:", err);
  }
  
  return animaciones;
}

// Posicionar jugador en la entrada del laberinto
function posicionarJugadorEnEntrada() {
  if (personaje && laberintoData) {
    // Usar las coordenadas de entrada específicas
    const entrada = laberintoData.entrada;
    
    // Convertir coordenadas del grid a posición mundial
    const posX = (entrada.x - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2;
    const posZ = (entrada.y - tamanoLaberinto/2) * tamanoCelda + tamanoCelda/2;
    
    // Posicionar al personaje justo en la entrada
    personaje.position.set(posX, 0, posZ);
    
    // Rotar para que mire hacia el laberinto (hacia la derecha en el grid)
    personaje.rotation.y = Math.PI / 2;
    
    console.log("Personaje posicionado en:", personaje.position);
    actualizarCamara();
  }
}


// Función para mostrar debug de colisión si es necesario
function mostrarDebugColision(caja) {
  // Eliminar debugs previos
  const debugPrevio = scene.getObjectByName("debugColision");
  if (debugPrevio) scene.remove(debugPrevio);
  
  // Crear geometría para la caja de colisión
  const boxHelper = new THREE.Box3Helper(caja, 0xff0000);
  boxHelper.name = "debugColision";
  scene.add(boxHelper);
}

// Detección de colisiones mejorada
function detectarColision(nuevaPosicion) {
  if (!personaje || !paredesLaberinto) return false;
  
  // Parámetros de colisión ajustables
  const radioColision = 0.7; // Radio de colisión del personaje (ajustar según el modelo)
  const alturaColision = 1.8; // Altura de la caja de colisión
  
  // Crear caja de colisión para el personaje en la nueva posición
  const cajaJugador = new THREE.Box3(
    new THREE.Vector3(
      nuevaPosicion.x - radioColision,
      nuevaPosicion.y, // Desde el suelo
      nuevaPosicion.z - radioColision
    ),
    new THREE.Vector3(
      nuevaPosicion.x + radioColision,
      nuevaPosicion.y + alturaColision,
      nuevaPosicion.z + radioColision
    )
  );
  
  // Mostrar debug de colisión si está activado
  if (colisionDebug) {
    mostrarDebugColision(cajaJugador);
  }
  
  // Verificar colisiones solo con las paredes del laberinto (mucho más eficiente)
  let colision = false;
  paredesLaberinto.children.forEach(pared => {
    const cajaPared = new THREE.Box3().setFromObject(pared);
    if (cajaJugador.intersectsBox(cajaPared)) {
      colision = true;
      // Opcional: visualizar paredes con las que se colisiona para depuración
      if (colisionDebug) {
        pared.material.color.set(0xff0000);
        setTimeout(() => pared.material.color.set(0xffffff), 100);
      }
    }
  });
  
  return colision;
}

function actualizarMovimiento(delta) {
   if (!personaje || !juegoIniciado || !animManager) return;
  if (!renderer.xr.isPresenting) return; // Solo mover si está en VR

  const velocidad = velocidadMovimiento * delta * 60;

  // Dirección hacia donde el usuario está mirando
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  direction.y = 0;
  direction.normalize();
  direction.multiplyScalar(velocidad);

  // Calcular nueva posición
  const nuevaPosicion = personaje.position.clone().add(direction);

  // Verificar colisión antes de mover
  if (!detectarColision(nuevaPosicion)) {
    personaje.position.copy(nuevaPosicion);
  }

  // Reproducir animación de caminar
  animManager.reproducirAnimacion('MapacheCaminando');

  // Verificar colisión con monedas
  detectarColisionConMonedas();

  // Verificar si ganó
  const distanciaAlCentro = personaje.position.distanceTo(new THREE.Vector3(0, 0, 0));
  if (!juegoGanado && distanciaAlCentro < tamanoCelda / 2) {
    ganarJuego();
  }
}

  function detectarColisionConMonedas() {
  for (let i = monedas.length - 1; i >= 0; i--) {
    const moneda = monedas[i];
    const distancia = personaje.position.distanceTo(moneda.position);
    if (distancia < 1) { // Umbral de colisión
      scene.remove(moneda);
      monedas.splice(i, 1);
      contador++;
      contadorDiv.textContent = `Monedas: ${contador}`;
    }
  }
}

function ganarJuego() {
  juegoGanado = true;
  
  const overlay = document.createElement('div');
  overlay.id = 'ganador-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.flexDirection = 'column';
  overlay.style.zIndex = '1000';
  overlay.style.color = 'white';
  overlay.style.fontFamily = 'Arial, sans-serif';
  
  const titulo = document.createElement('h1');
  titulo.textContent = '¡Ganaste!';
  titulo.style.fontSize = '4em';
  titulo.style.marginBottom = '20px';
  titulo.style.color = '#4CAF50';
  
  const mensaje = document.createElement('p');
  mensaje.textContent = 'Has llegado al centro del laberinto';
  mensaje.style.fontSize = '1.5em';
  mensaje.style.marginBottom = '40px';
  
  const botonReiniciar = document.createElement('button');
  botonReiniciar.textContent = 'Jugar de nuevo';
  botonReiniciar.style.padding = '15px 30px';
  botonReiniciar.style.fontSize = '1.2em';
  botonReiniciar.style.backgroundColor = '#4CAF50';
  botonReiniciar.style.color = 'white';
  botonReiniciar.style.border = 'none';
  botonReiniciar.style.borderRadius = '5px';
  botonReiniciar.style.cursor = 'pointer';
  
  botonReiniciar.addEventListener('click', () => {
    location.reload(); // Recarga la página para reiniciar
  });
  
  overlay.appendChild(titulo);
  overlay.appendChild(mensaje);
  overlay.appendChild(botonReiniciar);
  document.body.appendChild(overlay);
  
  // Desactivar controles
  juegoIniciado = false;
}

function actualizarCamara() {
  if (!personaje || renderer.xr.isPresenting) return; // No mover cámara en VR

  const distancia = 5;
  const altura = 2;

  const offsetX = Math.sin(personaje.rotation.y) * distancia;
  const offsetZ = Math.cos(personaje.rotation.y) * distancia;

  camera.position.set(
    personaje.position.x - offsetX,
    personaje.position.y + altura,
    personaje.position.z - offsetZ
  );

  const target = new THREE.Vector3(
    personaje.position.x,
    personaje.position.y + 1.6,
    personaje.position.z
  );

  camera.lookAt(target);
}

function avanzarConVR(valor, delta) {
  if (!personaje || !juegoIniciado || !animManager) return;

  const velocidad = velocidadMovimiento * delta * 60 * valor;

  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  direction.y = 0;
  direction.normalize();
  direction.multiplyScalar(velocidad);

  const nuevaPosicion = personaje.position.clone().add(direction);
  if (!detectarColision(nuevaPosicion)) {
    personaje.position.copy(nuevaPosicion);
  }

  animManager.reproducirAnimacion('MapacheCaminando');
  detectarColisionConMonedas();
}


// Bucle de animación
function animate() {
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();

    if (animManager) animManager.actualizar(delta);
    actualizarMovimiento(delta);
    actualizarCamara();

    renderer.render(scene, camera);
  });
  const session = renderer.xr.getSession();
if (session) {
  for (const source of session.inputSources) {
    if (source.gamepad) {
      const axes = source.gamepad.axes;
      const buttons = source.gamepad.buttons;

      // Eje hacia adelante (en la mayoría de los mandos VR es eje[3])
      const forwardValue = axes[3]; // Cambia a [1] si es el eje vertical

      if (Math.abs(forwardValue) > 0.2) {
        avanzarConVR(forwardValue, delta);
      }
    }
  }
}
}




// Iniciar la aplicación
init();