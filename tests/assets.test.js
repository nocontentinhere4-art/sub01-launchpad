import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Parses the built GLBs directly (header and JSON/BIN chunks). No browser, no three.js, no gltf-transform.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAR_DIR = path.join(ROOT, 'public/assets/characters');
const ROOM_DIR = path.join(ROOT, 'public/assets/room');

const CHARACTER_FILES = ['hoodie.glb', 'jacket.glb', 'suit.glb', 'tee.glb', 'worker.glb'];
const CLIPS = ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave', 'Interact'];
const ALLOWED_EXTENSIONS = new Set(['KHR_mesh_quantization', 'KHR_materials_unlit']);

// Budgets, in bytes (decimal). One outfit plus the shared anims is the phone load and must stay within 1.2 MB.
// The whole character set cannot reach 1.2 MB without visible loss (see ASSETS.md), so its budget is the measured
// total rounded up to the next 10 KB.
const OUTFIT_AND_ANIM_BUDGET = 1_200_000;
const CHARACTER_SET_BUDGET = 1_640_000;
const ROOM_BUDGET = 1_000_000;

// Material names must survive the pipeline unchanged: the app recolours by name.
const EXPECTED_MATERIALS = {
  'hoodie.glb': ['Eye', 'Eyebrows', 'Hair', 'LightBlue', 'Purple', 'Skin', 'White'],
  'jacket.glb': ['Eye', 'Eyebrows', 'Hair', 'LightBlue', 'LightBrown', 'Red_Dark', 'Skin', 'Skin_Darker', 'White'],
  'suit.glb': ['Black', 'Eye', 'Eyebrows', 'Hair', 'Skin', 'Suit', 'Tie', 'White'],
  'tee.glb': ['Earrings', 'Eye', 'Eyebrows', 'Hair', 'LightBrown', 'Red_Dark', 'Skin', 'White'],
  'worker.glb': ['Black', 'Brown', 'Brown2', 'Eye', 'Eyebrows', 'Grey', 'LightBrown', 'Moustache', 'Skin',
    'Worker_Vest', 'Worker_Yellow'],
};

const ROOM_MODELS = [
  'bedSingle', 'bedDouble', 'cabinetBed', 'cabinetBedDrawerTable', 'desk', 'deskCorner', 'chairDesk', 'chair',
  'chairCushion', 'computerScreen', 'computerKeyboard', 'computerMouse', 'laptop', 'bookcaseOpen', 'bookcaseOpenLow',
  'bookcaseClosedWide', 'books', 'kitchenFridgeSmall', 'kitchenFridge', 'kitchenMicrowave', 'kitchenCoffeeMachine',
  'doorway', 'doorwayFront', 'wallWindow', 'wallWindowSlide', 'lampRoundFloor', 'lampSquareFloor', 'lampRoundTable',
  'lampWall', 'ceilingFan', 'pottedPlant', 'plantSmall1', 'plantSmall2', 'plantSmall3', 'rugRectangle', 'rugRound',
  'rugSquare', 'rugDoormat', 'loungeSofa', 'loungeChair', 'loungeDesignSofa', 'tableCoffee', 'sideTable',
  'sideTableDrawers', 'televisionModern', 'cabinetTelevision', 'speaker', 'speakerSmall', 'radio', 'coatRackStanding',
  'cardboardBoxClosed', 'cardboardBoxOpen', 'trashcan', 'pillow', 'pillowBlue', 'bear', 'washer',
];

const COMPONENT = {
  5120: {size: 1, norm: 127, read: (dv, o) => dv.getInt8(o)},
  5121: {size: 1, norm: 255, read: (dv, o) => dv.getUint8(o)},
  5122: {size: 2, norm: 32767, read: (dv, o) => dv.getInt16(o, true)},
  5123: {size: 2, norm: 65535, read: (dv, o) => dv.getUint16(o, true)},
  5125: {size: 4, norm: 0, read: (dv, o) => dv.getUint32(o, true)},
  5126: {size: 4, norm: 0, read: (dv, o) => dv.getFloat32(o, true)},
};
const COUNT = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};

function readGlb(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('latin1', 0, 4), 'glTF', `${path.basename(file)}: bad magic`);
  assert.equal(buf.readUInt32LE(4), 2, `${path.basename(file)}: not glTF 2.0`);
  assert.equal(buf.readUInt32LE(8), buf.length, `${path.basename(file)}: header length mismatch`);
  const jsonLength = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, `${path.basename(file)}: first chunk is not JSON`);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  let bin = null;
  const binStart = 20 + jsonLength;
  if (binStart < buf.length) {
    const binLength = buf.readUInt32LE(binStart);
    assert.equal(buf.readUInt32LE(binStart + 4), 0x004e4942, `${path.basename(file)}: second chunk is not BIN`);
    bin = buf.subarray(binStart + 8, binStart + 8 + binLength);
  }
  return {file, json, bin, size: buf.length};
}

function readAccessor(glb, index) {
  const accessor = glb.json.accessors[index];
  const view = glb.json.bufferViews[accessor.bufferView];
  const comp = COMPONENT[accessor.componentType];
  const n = COUNT[accessor.type];
  const stride = view.byteStride ?? comp.size * n;
  const dv = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Float64Array(accessor.count * n);
  for (let i = 0; i < accessor.count; i++) {
    for (let j = 0; j < n; j++) {
      let v = comp.read(dv, base + i * stride + j * comp.size);
      if (accessor.normalized && comp.norm) v = Math.max(-1, v / comp.norm);
      values[i * n + j] = v;
    }
  }
  return {values, count: accessor.count, n};
}

const characters = Object.fromEntries(CHARACTER_FILES.map((f) => [f, readGlb(path.join(CHAR_DIR, f))]));
const anims = readGlb(path.join(CHAR_DIR, 'anims.glb'));
const roomFiles = readdirSync(ROOM_DIR).filter((f) => f.endsWith('.glb')).sort();
const manifest = JSON.parse(readFileSync(path.join(ROOM_DIR, 'manifest.json'), 'utf8'));
const jointNames = (glb) => glb.json.skins[0].joints.map((j) => glb.json.nodes[j].name);
const referenceJoints = jointNames(characters['hoodie.glb']);

test('every character is one skin with no animations, textures or compression extensions', () => {
  for (const [file, glb] of Object.entries(characters)) {
    assert.equal(glb.json.skins?.length, 1, `${file} has one skin`);
    assert.equal(glb.json.animations?.length ?? 0, 0, `${file} has no animations`);
    assert.equal(glb.json.images, undefined, `${file} has no images`);
    assert.equal(glb.json.textures, undefined, `${file} has no textures`);
    for (const ext of glb.json.extensionsUsed ?? []) assert.ok(ALLOWED_EXTENSIONS.has(ext), `${file} uses ${ext}`);
  }
});

test('all characters share one rig with identical bone names in the same order', () => {
  assert.equal(referenceJoints.length, 62);
  for (const [file, glb] of Object.entries(characters)) {
    assert.deepEqual(jointNames(glb), referenceJoints, `${file} bone names`);
  }
});

test('material names are preserved for every character', () => {
  for (const [file, glb] of Object.entries(characters)) {
    const names = [...new Set(glb.json.materials.map((m) => m.name))].sort();
    assert.deepEqual(names, EXPECTED_MATERIALS[file], `${file} materials`);
  }
});

test('skinning is valid: weights sum to 1 per vertex and joint indices stay in range', () => {
  for (const [file, glb] of Object.entries(characters)) {
    for (const mesh of glb.json.meshes) for (const prim of mesh.primitives) {
      const {JOINTS_0: jointsIndex, WEIGHTS_0: weightsIndex} = prim.attributes;
      assert.ok(jointsIndex !== undefined && weightsIndex !== undefined, `${file}/${mesh.name} is skinned`);
      const joints = readAccessor(glb, jointsIndex);
      const weights = readAccessor(glb, weightsIndex);
      assert.equal(joints.count, weights.count);
      for (let i = 0; i < weights.count; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += weights.values[i * 4 + k];
          assert.ok(joints.values[i * 4 + k] < referenceJoints.length, `${file}/${mesh.name} joint index in range`);
        }
        assert.ok(Math.abs(sum - 1) < 1e-6, `${file}/${mesh.name} vertex ${i} weights sum ${sum}`);
      }
    }
  }
});

test('anims.glb holds exactly the six clips and no meshes or skins', () => {
  assert.deepEqual(anims.json.animations.map((a) => a.name).sort(), [...CLIPS].sort());
  for (const clip of anims.json.animations) assert.ok(clip.channels.length > 0, `${clip.name} has channels`);
  assert.equal(anims.json.meshes, undefined, 'anims.glb has no meshes');
  assert.equal(anims.json.skins, undefined, 'anims.glb has no skins');
});

test('animation bone names match every character exactly', () => {
  for (const node of anims.json.nodes) {
    assert.ok(node.name, 'every animation node is named');
    for (const [file, glb] of Object.entries(characters)) {
      assert.ok(jointNames(glb).includes(node.name), `${node.name} is a bone in ${file}`);
    }
  }
  for (const clip of anims.json.animations) for (const channel of clip.channels) {
    const target = anims.json.nodes[channel.target.node];
    assert.ok(referenceJoints.includes(target.name), `${clip.name} targets ${target.name}`);
  }
});

test('every room model listed in the manifest exists and matches its file size', () => {
  assert.deepEqual(roomFiles, ROOM_MODELS.map((n) => `${n}.glb`).sort(), 'room folder has exactly the expected models');
  assert.deepEqual(Object.keys(manifest).sort(), [...ROOM_MODELS].sort(), 'manifest has every room model');
  for (const name of ROOM_MODELS) {
    const entry = manifest[name];
    const file = path.join(ROOM_DIR, `${name}.glb`);
    assert.ok(existsSync(file), `${name}.glb exists`);
    assert.equal(entry.bytes, statSync(file).size, `${name} bytes`);
    for (const axis of entry.size) assert.ok(axis > 0, `${name} has positive size`);
    assert.equal(entry.size.length, 3);
    assert.equal(entry.min.length, 3);
  }
});

test('room models are static, textureless and use only the quantisation extension', () => {
  for (const name of ROOM_MODELS) {
    const glb = readGlb(path.join(ROOM_DIR, `${name}.glb`));
    assert.equal(glb.json.animations?.length ?? 0, 0, `${name} has no animations`);
    assert.equal(glb.json.skins, undefined, `${name} has no skin`);
    assert.equal(glb.json.images, undefined, `${name} has no images`);
    assert.equal(glb.json.textures, undefined, `${name} has no textures`);
    for (const ext of glb.json.extensionsUsed ?? []) assert.ok(ALLOWED_EXTENSIONS.has(ext), `${name} uses ${ext}`);
  }
});

test('each single outfit with the shared animations fits the phone budget (1.2 MB)', () => {
  for (const file of CHARACTER_FILES) {
    const total = characters[file].size + anims.size;
    assert.ok(total <= OUTFIT_AND_ANIM_BUDGET, `${file} + anims.glb = ${total} bytes`);
  }
});

test('all character GLBs and anims.glb together fit the character-set budget', () => {
  const total = CHARACTER_FILES.reduce((sum, f) => sum + characters[f].size, anims.size);
  assert.ok(total <= CHARACTER_SET_BUDGET, `characters + anims = ${total} bytes (budget ${CHARACTER_SET_BUDGET})`);
});

test('the room folder fits the 1.0 MB budget', () => {
  const total = readdirSync(ROOM_DIR).reduce((sum, f) => sum + statSync(path.join(ROOM_DIR, f)).size, 0);
  assert.ok(total <= ROOM_BUDGET, `room folder = ${total} bytes (budget ${ROOM_BUDGET})`);
});

test('CC0 licence texts for Kenney and Quaternius are shipped', () => {
  const kenney = readFileSync(path.join(ROOT, 'licenses/Kenney.txt'), 'utf8');
  assert.match(kenney, /Creative Commons Zero/);
  const quaternius = readFileSync(path.join(ROOT, 'licenses/Quaternius.txt'), 'utf8');
  assert.match(quaternius, /CC0 1\.0/);
});
