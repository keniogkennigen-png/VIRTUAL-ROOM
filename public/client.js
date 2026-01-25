const socket = io();
const urlParams = new URLSearchParams(window.location.search);

const roomId = urlParams.get('room') || 'default';
const username = urlParams.get('username') || 'Guest';

const rig = document.querySelector('#rig');
const player = document.querySelector('#player');

let seated = false;
let currentChair = null;

/* -------------------------------
   🚶 MOVIMIENTO + SINCRONIZACIÓN
--------------------------------*/
setInterval(() => {
  if (!seated) {
    socket.emit('update-position', {
      roomId,
      position: rig.object3D.position
    });
  }
}, 100);

/* -------------------------------
   🪑 SISTEMA DE SILLAS
--------------------------------*/
document.querySelectorAll('.chair').forEach((chair, index) => {
  chair.addEventListener('click', () => {
    if (seated) return;

    seated = true;
    currentChair = index;

    player.removeAttribute('wasd-controls');

    rig.setAttribute('position', {
      x: chair.object3D.position.x,
      y: 0,
      z: chair.object3D.position.z
    });

    socket.emit('sit-chair', { roomId, chairIndex: index });
  });
});

/* -------------------------------
   🧍 LEVANTARSE
--------------------------------*/
window.addEventListener('keydown', e => {
  if (e.key === ' ' && seated) {
    seated = false;
    currentChair = null;

    player.setAttribute('wasd-controls', 'acceleration: 25');
  }
});

/* -------------------------------
   👥 OTROS USUARIOS
--------------------------------*/
const avatars = {};

socket.on('room-users', users => {
  users.forEach(user => {
    if (user.id === socket.id) return;

    if (!avatars[user.id]) {
      const avatar = document.createElement('a-box');
      avatar.setAttribute('color', user.avatarColor || '#00f3ff');
      avatar.setAttribute('height', user.chairIndex !== null ? 1 : 1.7);
      avatar.setAttribute('width', 0.4);
      avatar.setAttribute('depth', 0.4);
      avatar.setAttribute('id', `avatar-${user.id}`);

      document.querySelector('a-scene').appendChild(avatar);
      avatars[user.id] = avatar;
    }

    if (user.position) {
      avatars[user.id].setAttribute('position', user.position);
    }
  });
});

/* -------------------------------
   🧱 COLISIONES (NO ATRAVESAR)
--------------------------------*/
AFRAME.registerComponent('collision-detector', {
  tick() {
    const pos = rig.object3D.position;
    if (pos.x > 5) pos.x = 5;
    if (pos.x < -5) pos.x = -5;
    if (pos.z > 5) pos.z = 5;
    if (pos.z < -5) pos.z = -5;
  }
});

/* -------------------------------
   🚪 CONEXIÓN
--------------------------------*/
socket.emit('join-room', {
  roomId,
  username,
  avatarColor: '#00f3ff'
});
