var camera, scene, renderer;

const USE_WIREFRAME = false;
const screenWidth = window.innerWidth, screenHeight = window.innerHeight;
const movementSettings = {
  height: 2,
  speed: 0.2,
}

var floor;
const discArray = [];
const keyboard = {};

//Necessary global variables to enable motion along XY plane
var objectControls; //gv to instantiate the ObjectControls library
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2(); //gv's that have to do with figure out which object the mouse is over
var intersectionPlane;

//Global object to track state of disk
let currentDisc = {
  radius: 0,
  originalX: -10, //all the discs start at -10
  releasedX: -10, //same as originalX since none have been picked up
  isMoved() {
    return Math.abs(currentDisc.originalX - currentDisc.releasedX) >= 5 ? true : false;
  },
  newPlatform() {
    if (currentDisc.releasedX <= -5) {
      return rightTower;
    } else if (currentDisc.releasedX > -5 && currentDisc.releasedX <= 5) {
      return centerTower;
    } else if (currentDisc.releasedX > 5) {
      return leftTower;
    }
  },
  oldPlatform() {
    if (currentDisc.originalX <= -5) {
      return rightTower;
    } else if (currentDisc.originalX > -5 && currentDisc.originalX <= 5) {
      return centerTower;
    } else if (currentDisc.originalX > 5) {
      return leftTower;
    }
  }
};

//Instantiate globally accessible tower arrays
let leftTower = ["left"];
let centerTower = ["center"];
let rightTower = ["right"];

/************************
** Initialize Function **
*************************/
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(90, screenWidth / screenHeight, 0.1, 1000);
  camera.position.set(0, movementSettings.height, -20);
  camera.lookAt(new THREE.Vector3(0, 50, 100));

  buildRenderer(); //build the renderer

  //Instantiate object controls
  objectControls = new ObjectControls(camera); //initialize controls in ObjectControls library

  //Instantiate orbit controls
  createIntersectionPlane(); //add a plane for the discs to move along when dragged

  //Add floor, left plataform, right plataform and center plataform to the scene
  addFloor();
  addPlatformAt("left");
  addPlatformAt("right");
  addPlatformAt("center");

  loadTowerArrays(); //load up the initial tower arrays

  letThereBeLight(); //add a point light and ambient to the scene
  addSpotlight(); //

  //build the initial tower (size of the disc, color and position in the tower (position referenced by the floor))
  addDisc(4, "purple", 1);
  addDisc(3, "yellow", 2);
  addDisc(2, "green", 3);
  addDisc(1, "blue", 4);
  addDisc(0.5, "red", 5)

  animate(); //set everything in motion
}

function buildRenderer() {
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(screenWidth, screenHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.gammaInput = true;
  renderer.gammaOutput = true;

  document.body.appendChild(renderer.domElement);
}

function animate() {
  requestAnimationFrame(animate);
  handleMovement(); //allow and update keyboard movements
  objectControls.update(); //update the object controls

  render();
}

function render() {
  renderer.render(scene, camera);
}


/**********************************
*** Geometry Creation Functions ***
**********************************/

function addDisc(number, color, stackPosition) {
  //add a new cylinder on to the stack with number, a color, and the position in the stack
  //instantiate a cylinder (radiusTop, radiusBottom, height, radiusSegments, heightSegments, openEnded, thetaStart, thetaLength)
  let discGeometry = new THREE.CylinderGeometry(number, number, 0.8, 50, false);
  let discMaterial = new THREE.MeshPhongMaterial({ color: color, wireframe: false });
  let disc = new THREE.Mesh(discGeometry, discMaterial);
  let y = stackPosition === 1 ? 0.4 + (stackPosition * disc.geometry.parameters.height / 2) :
    (stackPosition * (disc.geometry.parameters.height)); //place the cylinder on top of the platform
  let x = 10; //place the cylinder in the center of the left platform
  let z = 0; //place it in the center of the floor (no height)

  let hoverMaterial = new THREE.MeshBasicMaterial({ color: 0x55ff88 }); //when hovering over a disc, change the color & material
  disc.hoverOver = function () { //when hovering over a disc, change its color
    this.material = hoverMaterial;
  }.bind(disc);

  disc.hoverOut = function () { //change back to normal color on hover out
    this.material = discMaterial;
  }.bind(disc);

  disc.select = function () { //allow the disc to move when selected
    currentDisc.originalX = this.position.x; //set the original x position of the disc on select in case it has to go back
    currentDisc.radius = this.geometry.parameters.radiusTop; //set the current disc radius to the selected disc radius

    //overwrite the tower values so they only contain data from most recent move
    leftTower = ["left"];
    centerTower = ["center"];
    rightTower = ["right"];
    loadTowerArrays(); //load the tower arrays in order to determine whether this thing is allowed to move
  }.bind(disc); //bind the method context to the selected disc

  disc.deselect = function snapIntoPlace() { //when the disc is deselected, snap it into place (if the move is legal)
    currentDisc.releasedX = this.position.x; //the position the disc is released at

    if (currentDisc.isMoved()) { //everything that happens here assumes that the disc is moveable
      let newTower = currentDisc.newPlatform(); //get the platform the disc is being moved to
      let oldTower = currentDisc.oldPlatform(); //get the platform the disc is being moved from
      if (newTower.length > 1) { //if there are any discs already in the new tower
        let topDiscRadius = newTower[newTower.length - 1].geometry.parameters.radiusTop; //get the top disc radius
        if (currentDisc.radius > topDiscRadius) { //if the current disc radius is larger than the top disc radius
          this.position.x = currentDisc.originalX; // Illegal move - send the current disc back to its original position
        } else if (currentDisc.radius < topDiscRadius) { // if the current disc radius is smaller than the top disc radius
          this.position.x = newTower[1].position.x; //throw that disc on the tower
          oldTower.splice(oldTower.indexOf(this), 1); //remove it from the oldTower array
          newTower.push(this); //add it to the newTower array
        }
      } else if (newTower.length === 1) { //if there are no other discs in the center tower
        oldTower.splice(oldTower.indexOf(this), 1); //remove it from the old tower
        newTower.push(this); //add it to the new tower
      }
    }

    let towerArray = [leftTower, centerTower, rightTower];
    towerArray.forEach(function snapDicsIntoPlace(tower) {
      for (let i = 1; i < tower.length; i++) {
        tower[i].position.x =
          tower === leftTower ? 10 :
          tower === centerTower ? 0 :
          tower === rightTower ? -10 :
          0;
        tower[i].position.y = i * tower[i].geometry.parameters.height;
      }
    });
  }.bind(disc);

  disc.update = function () {
    let raycaster = objectControls.raycaster;
    let i = raycaster.intersectObject(intersectionPlane);

    /* Game logic: most recently added disc will be saved in index 1 of its tower and everything gets pushed up,
    so only allow the disc to move if it is the last index in it's tower */
    if (leftTower.indexOf(this) !== -1) { //if selected disc is in left tower
      let moveable = leftTower.indexOf(this) === leftTower.length - 1 ? true : false;
      if (moveable) {
        this.position.copy(i[0].point);
      }
    } else if (centerTower.indexOf(this) !== -1) { //if selected disc is in center tower
      let moveable = centerTower.indexOf(this) === centerTower.length - 1 ? true : false;
      if (moveable) {
        this.position.copy(i[0].point);
      }
    } else if (rightTower.indexOf(this) !== -1) { //if selected disc is in right tower
      let moveable = rightTower.indexOf(this) === rightTower.length - 1 ? true : false;
      if (moveable) {
        this.position.copy(i[0].point);
      }
    }
  }.bind(disc);

  disc.position.set(x, y, z);
  disc.receiveShadow = true;
  disc.castShadow = true;
  scene.add(disc);
  discArray.push(disc);
  objectControls.add(disc);
}

function loadTowerArrays() {
  for (var i = 0; i < discArray.length; i++) {
    let xPosition = discArray[i].position.x;
    if (xPosition >= 5) {
      leftTower.push(discArray[i]);
    } else if (xPosition < 5 && xPosition > -5) {
      centerTower.push(discArray[i]);
    } else if (xPosition < -5) {
      rightTower.push(discArray[i]);
    }
  }
}

function addPlatformAt(position) {
  //add a new platform at "left", "right", or "center"
  //instantiate a cylinder (radiusTop, radiusBottom, height, radiusSegments, heightSegments, openEnded, thetaStart, thetaLength)
  let platformGeometry = new THREE.CylinderGeometry(4, 4, 0.4, 50, false);
  let platformMaterial = new THREE.MeshPhongMaterial({ color: 0x808080, wireframe: USE_WIREFRAME });
  let platform = new THREE.Mesh(platformGeometry, platformMaterial);
  let y = platform.geometry.parameters.height / 2; //bottom of platform touches floor
  let x =
    position === "left" ? -10 :
      position === "right" ? 10 :
        position === "center" ? 0 :
              -30; //if nothing is provided, place platform in center
  let z = 0; //place it in the center of the floor

  platform.position.set(x, y, z);
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);
}

function addFloor() {
  //instantiate a plane (width, height, widthSegments [opt], heightSegments [opt])
  let planeGeometry = new THREE.PlaneGeometry(1000, 1000, 20, 20);
  let planeMaterial = new THREE.MeshPhongMaterial({ color: 0xebecf0, wireframe: USE_WIREFRAME });
  floor = new THREE.Mesh(planeGeometry, planeMaterial);
  floor.rotation.x -= Math.PI / 2; //turn the floor horizontally to make sure it's facing up
  floor.receiveShadow = true;
  floor.scale.set(1000, 1000, 1000);
  scene.add(floor);
}

function createIntersectionPlane() {
  let geo = new THREE.PlaneGeometry(100000, 100000, 8, 8);
  let mat = new THREE.MeshNormalMaterial({ visible: false, side: THREE.DoubleSide });
  intersectionPlane = new THREE.Mesh(geo, mat);
  intersectionPlane.position.set(0, 0, 0);
  scene.add(intersectionPlane);
}

/***************
*** Lighting ***
****************/
function letThereBeLight() {
  //instantiate a new point light (color [opt], intensity [opt], distance, decay)
  let pointLight = new THREE.PointLight(0xffffff, 1, 50, 2);
  pointLight.position.set(-3, 6, -6);
  pointLight.castShadow = true;
  pointLight.shadow.camera.near = 0.1;
  pointLight.shadow.camera.far = 25;
  scene.add(pointLight);

  //instantiate a new ambient light
  var ambientLight = new THREE.AmbientLight( 0xebecf0 );
  //scene.add( ambientLight );
}

function addSpotlight() {
  let spotLight = new THREE.SpotLight(0xff0000, 2);
  spotLight.position.set(-10, 50, 0);
  spotLight.castShadow = true;
  spotLight.angle = 0.15;
  spotLight.penumbra = 1;
  spotLight.decay = 2;
  spotLight.distance = 200;
  spotLight.shadow.mapSize.width = 1024;
  spotLight.shadow.mapSize.height = 1024;
  spotLight.shadow.camera.near = 1;
  spotLight.shadow.camera.far = 200;
  spotLight.target.position.set(-10, 0, 0);

  scene.add(spotLight);
  scene.add(spotLight.target);
}

/**************************
***** Keyboard Events *****
**************************/
function handleMovement() {
  if (keyboard[87]) { //W key (forward)
    camera.position.x -= Math.sin(camera.rotation.y) * movementSettings.speed;
    camera.position.z -= -Math.cos(camera.rotation.y) * movementSettings.speed;
  }
  if (keyboard[83]) { //S key (backward)
    camera.position.x += Math.sin(camera.rotation.y) * movementSettings.speed;
    camera.position.z += -Math.cos(camera.rotation.y) * movementSettings.speed;
  }
  if (keyboard[65]) { // A key (turn right)
    camera.rotation.y -= movementSettings.speed / 5;
  }
  if (keyboard[68]) { //D key (turn left)
    camera.rotation.y += movementSettings.speed / 5;
  }
  if (keyboard[81]) { //Q key (move left)
    camera.position.x += -Math.sin(camera.rotation.y - Math.PI / 2) * movementSettings.speed;
    camera.position.z += Math.cos(camera.rotation.y - Math.PI / 2) * movementSettings.speed;
  }
  if (keyboard[69]) { //E key (move right)
    camera.position.x += Math.sin(camera.rotation.y - Math.PI / 2) * movementSettings.speed;
    camera.position.z += -Math.cos(camera.rotation.y - Math.PI / 2) * movementSettings.speed;
  }
  if (keyboard[32]) { //Space bar (move up)
    camera.position.y += movementSettings.speed;
    camera.position.z -= movementSettings.speed;
  }
  if (keyboard[88]) { //X key (move down)
    if (camera.position.y > 1) {
      camera.position.y -= movementSettings.speed;
      camera.position.z += movementSettings.speed;
    }
  }
}
function keyDown(event) {
  keyboard[event.keyCode] = true;
}
function keyUp(event) {
  keyboard[event.keyCode] = false;
}

/************************
**** Event Listeners ****
************************/
window.addEventListener('keydown', keyDown);
window.addEventListener('keyup', keyUp);

window.onload = init;
