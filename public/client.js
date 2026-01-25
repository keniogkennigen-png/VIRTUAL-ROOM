const socket = io();
const params = new URLSearchParams(window.location.search);
const roomId = params.get('room') || 'default';
const username = params.get('username') || 'Guest';

const rig = document.querySelector('#rig');
const screen = document.querySelector('#screen');

let seated = false;
let myChair = null;
const lockedChairs = {};
const avatars = {};

/* ---------------- JOIN ---------------- */
socket.emit('join-room', { roomId, username });

/* ---------------- SILLAS 100% SERVER ---------------- */
document.querySelectorAll('.chair').forEach(chair => {
  chair.addEventListener('click', () => {
    const index = chair.dataset.index;
    if (lockedChairs[index]) return;

    socket.emit('sit-chair', { roomId, chairIndex: index });
  });
});

socket.on('room-users', users => {
  Object.keys(lockedChairs).forEach(k => delete lockedChairs[k]);

  users.forEach(u => {
    if (u.chairIndex !== null) {
      lockedChairs[u.chairIndex] = u.id;
    }

    if (u.id === socket.id && u.chairIndex !== null) {
      seated = true;
      myChair = u.chairIndex;
      rig.setAttribute('position', document.querySelector(
        `.chair[data-index="${u.chairIndex}"]`
      ).getAttribute('position'));
      document.querySelector('#camera').removeAttribute('wasd-controls');
    }
  });
});

/* ---------------- LEVANTARSE ---------------- */
window.addEventListener('keydown', e => {
  if (e.key === ' ' && seated) {
    seated = false;
    myChair = null;
    document.querySelector('#camera')
      .setAttribute('wasd-controls', 'acceleration:20');
  }
});

/* ---------------- AVATARES HUMANOS ---------------- */
socket.on('user-joined', user => {
  const avatar = document.createElement('a-entity');
  avatar.setAttribute('gltf-model', 'url(/avatar.glb)');
  avatar.setAttribute('scale', '1 1 1');
  avatar.setAttribute('id', user.id);
  document.querySelector('a-scene').appendChild(avatar);
  avatars[user.id] = avatar;
});

socket.on('user-left', user => {
  avatars[user.id]?.remove();
});

/* ---------------- PDF ---------------- */
document.getElementById('pdfInput').addEventListener('change', e => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('share-pdf', {
      roomId,
      pdfData: reader.result,
      filename: file.name
    });
  };
  reader.readAsDataURL(file);
});

socket.on('content-update', data => {
  if (data.type === 'pdf') {
    screen.setAttribute('material', {
      src: data.data
    });
  }
  if (data.type === 'video') {
    screen.setAttribute('material', {
      src: `https://www.youtube.com/embed/${extractYT(data.data)}`
    });
  }
});

/* ---------------- VIDEO ---------------- */
function shareVideo() {
  const url = document.getElementById('ytInput').value;
  socket.emit('share-video', { roomId, videoUrl: url });
}

function extractYT(url) {
  return url.split('v=')[1];
}
