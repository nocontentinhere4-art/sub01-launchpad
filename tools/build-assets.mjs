#!/usr/bin/env node
/**
 * Reproducible asset pipeline for public/assets. Offline tooling only; nothing here ships to the browser.
 *
 *   node tools/build-assets.mjs <quaternius-dir> <kenney-kit-dir>
 *
 * <quaternius-dir>  Ultimate Modular Men (CC0): Casual_2.gltf, Suit.gltf, Punk.gltf, Beach.gltf, Worker.gltf
 * <kenney-kit-dir>  Kenney Furniture Kit 2.0 (CC0) root, containing "Models/GLTF format/" and "License.txt"
 *
 * Both directories are read only. Their contents are untrusted data: they are parsed, never executed.
 * The hoodie character and the animation clips come from the committed public/assets/characters/Casual_Hoodie.glb,
 * which is read and never modified.
 *
 * Constraints baked in: no textures (flat material colours), no Draco or Meshopt (the app CSP forbids
 * WebAssembly), KHR_mesh_quantization only (three.js GLTFLoader reads it natively, no decoder).
 */
import {existsSync} from 'node:fs';
import {copyFile, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Logger, NodeIO} from '@gltf-transform/core';
import {KHRMaterialsUnlit, KHRMeshQuantization} from '@gltf-transform/extensions';
import {dedup, getBounds, prune, quantize, weld} from '@gltf-transform/functions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAR_OUT = path.join(ROOT, 'public/assets/characters');
const ROOM_OUT = path.join(ROOT, 'public/assets/room');
const LICENSE_OUT = path.join(ROOT, 'licenses');

/** Clips the app plays. Everything else in the source packs is dropped. */
const CLIPS = ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave', 'Interact'];

/**
 * Character meshes without animations. `source: 'repo'` reads from public/assets/characters (committed file).
 * tee.glb is Beach: its only upper-body garment is a single fitted torso layer (LightBrown, hips to neckline)
 * over a shorts pair. Punk stacks a white shirt under a black collared top, which reads as layered punk styling.
 */
const CHARACTERS = [
  {out: 'hoodie.glb', source: 'repo', file: 'Casual_Hoodie.glb'},
  {out: 'jacket.glb', source: 'quaternius', file: 'Casual_2.gltf'},
  {out: 'suit.glb', source: 'quaternius', file: 'Suit.gltf'},
  {out: 'tee.glb', source: 'quaternius', file: 'Beach.gltf'},
  {out: 'worker.glb', source: 'quaternius', file: 'Worker.gltf'},
];

/** Room furniture, copied and optimised from the Kenney kit. Names match the output file names. */
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

/**
 * Quantisation. Bits only set precision inside the storage type: Int16 for positions (16 bits = full range, no size
 * cost over 14), Int8 for normals and weights (smallest storage that still shades smooth surfaces cleanly).
 * Vertex colours are Uint8 normalised, and they are dropped entirely when they are all white.
 */
const CHARACTER_QUANTIZE = {quantizationVolume: 'scene', quantizePosition: 16, quantizeNormal: 8, quantizeColor: 8,
  quantizeWeight: 8, normalizeWeights: true};
const ROOM_QUANTIZE = {quantizationVolume: 'scene', quantizePosition: 16, quantizeNormal: 8, quantizeColor: 8,
  quantizeWeight: 8};

const POSITION_EPSILON = 1e-3; // bounds may move by at most 1 mm from quantisation
/** Props stripped by node name. Each must be bound only to right-hand bones (a held object, not body or clothing). */
const PROPS = {'suit.glb': ['Pistol']};
const HAND_BONE = /^(Wrist|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])\.R$/;
/** The committed Casual_Hoodie.glb is no longer in the tree; its path is the third CLI argument. */
let hoodieSource = null;
const ANIM_EPSILON = 1e-5;

const io = new NodeIO().registerExtensions([KHRMeshQuantization, KHRMaterialsUnlit]).setLogger(
  new Logger(Logger.Verbosity.WARN));

function fail(message) {
  throw new Error(`build-assets: ${message}`);
}

function sortedUnique(list) {
  return [...new Set(list)].sort();
}

function jointNamesOf(doc) {
  const skins = doc.getRoot().listSkins();
  if (skins.length !== 1) fail(`expected exactly one skin, found ${skins.length}`);
  return skins[0].listJoints().map((joint) => joint.getName());
}

function ensureScene(doc) {
  const root = doc.getRoot();
  if (root.listScenes().length === 0) {
    const scene = doc.createScene('Scene');
    for (const node of root.listNodes()) if (!node.getParentNode()) scene.addChild(node);
    root.setDefaultScene(scene);
  } else if (!root.getDefaultScene()) {
    root.setDefaultScene(root.listScenes()[0]);
  }
  return root.getDefaultScene() ?? root.listScenes()[0];
}

/** Animation.dispose() alone leaves channels, samplers and their keyframe accessors attached. Remove them all. */
function disposeAnimation(animation) {
  for (const channel of animation.listChannels()) channel.dispose();
  for (const sampler of animation.listSamplers()) sampler.dispose();
  animation.dispose();
}

function allWhite(accessor) {
  const values = accessor.getArray();
  const scale = accessor.getNormalized() ? 1 / (values instanceof Uint8Array ? 255 : 65535) : 1;
  for (const v of values) if (Math.abs(v * scale - 1) > 1e-6) return false;
  return true;
}

function boundsOf(scene) {
  const {min, max} = getBounds(scene);
  return {min, max};
}

function maxBoundsDelta(a, b) {
  let delta = 0;
  for (let i = 0; i < 3; i++) {
    delta = Math.max(delta, Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i]));
  }
  return delta;
}

/** Skin weights become exact Uint8 values that sum to 255, so every vertex is exactly weighted to 1. */
function fixSkinWeights(doc) {
  const seen = new Set();
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const weights = prim.getAttribute('WEIGHTS_0');
    if (!weights || seen.has(weights)) continue;
    seen.add(weights);
    if (!(weights.getArray() instanceof Uint8Array) || !weights.getNormalized()) fail('unexpected weight storage');
    const arr = new Uint8Array(weights.getArray());
    for (let i = 0; i < arr.length; i += 4) {
      let sum = 0;
      let best = i;
      for (let k = i; k < i + 4; k++) {
        sum += arr[k];
        if (arr[k] > arr[best]) best = k;
      }
      if (sum === 0) fail('a skinned vertex has no weights');
      const diff = 255 - sum;
      if (diff !== 0) {
        const value = arr[best] + diff;
        if (value < 0 || value > 255) fail('weight correction out of range');
        arr[best] = value;
      }
    }
    weights.setArray(arr);
    weights.setNormalized(true);
  }
}

/** quantize() gives every skinned mesh its own skin copy (with identical inverse bind matrices). Merge them. */
function unifySkins(doc) {
  const skinned = doc.getRoot().listNodes().filter((node) => node.getSkin());
  if (!skinned.length) return;
  const primary = skinned[0].getSkin();
  const reference = primary.getInverseBindMatrices().getArray();
  for (const node of skinned) {
    const skin = node.getSkin();
    if (skin === primary) continue;
    const joints = skin.listJoints();
    const primaryJoints = primary.listJoints();
    if (joints.length !== primaryJoints.length || joints.some((joint, i) => joint !== primaryJoints[i])) {
      fail('skin copies disagree on their joints');
    }
    const ibm = skin.getInverseBindMatrices().getArray();
    if (ibm.length !== reference.length) fail('skin copies disagree on inverse bind matrices');
    for (let i = 0; i < ibm.length; i++) {
      if (Math.abs(ibm[i] - reference[i]) > 1e-6) fail('skin copies disagree on inverse bind matrices');
    }
    node.setSkin(primary);
  }
}

async function readFileAt(full) {
  if (!existsSync(full)) fail(`missing source ${full}`);
  return io.read(full);
}

/** The hoodie comes from the path passed as the third argument; the other characters come from the Quaternius folder. */
function sourcePath(spec, quaterniusDir) {
  return spec.source === 'repo' ? hoodieSource : path.join(quaterniusDir, spec.file);
}

/** Rest TRS of every joint in one character, for the animation check. */
function restPoseOf(doc) {
  const pose = new Map();
  for (const joint of doc.getRoot().listSkins()[0].listJoints()) {
    pose.set(joint.getName(), {
      translation: joint.getTranslation(),
      rotation: joint.getRotation(),
      scale: joint.getScale(),
    });
  }
  return pose;
}

async function buildCharacter(spec, quaterniusDir) {
  const doc = await readFileAt(sourcePath(spec, quaterniusDir));
  const removedProps = removeProps(doc, spec.out);
  await doc.transform(prune({keepLeaves: true}));
  const root = doc.getRoot();
  if (root.listTextures().length) fail(`${spec.file} has textures; flat colours are required`);
  if (root.listSkins().length !== 1) fail(`${spec.file} must have exactly one skin`);
  const materialsBefore = sortedUnique(root.listMaterials().map((m) => m.getName()));
  const nodeNamesBefore = sortedUnique(root.listNodes().map((n) => n.getName()).filter(Boolean));
  const jointsBefore = jointNamesOf(doc);

  for (const animation of root.listAnimations()) disposeAnimation(animation);
  let droppedColors = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (prim.listTargets().length) fail(`${spec.file} has morph targets`);
    const color = prim.getAttribute('COLOR_0');
    if (color) {
      if (!allWhite(color)) fail(`${spec.file} has non-white vertex colours`);
      prim.setAttribute('COLOR_0', null);
      droppedColors++;
    }
  }

  await doc.transform(prune({keepLeaves: true}), dedup({keepUniqueNames: true}), weld(),
    quantize(CHARACTER_QUANTIZE));
  unifySkins(doc);
  fixSkinWeights(doc);
  await doc.transform(prune({keepLeaves: true}), dedup({keepUniqueNames: true}));

  const after = doc.getRoot();
  if (after.listAnimations().length) fail(`${spec.out} still has animations`);
  if (after.listSkins().length !== 1) fail(`${spec.out} did not unify to one skin`);
  if (after.listTextures().length) fail(`${spec.out} gained textures`);
  if (JSON.stringify(sortedUnique(after.listMaterials().map((m) => m.getName()))) !== JSON.stringify(materialsBefore)) {
    fail(`${spec.out} changed material names`);
  }
  const nodeNamesAfter = new Set(after.listNodes().map((n) => n.getName()));
  for (const name of nodeNamesBefore) if (!nodeNamesAfter.has(name)) fail(`${spec.out} lost node "${name}"`);
  if (JSON.stringify(jointNamesOf(doc)) !== JSON.stringify(jointsBefore)) fail(`${spec.out} changed its joints`);

  roundNodeTransforms(doc);
  const outPath = path.join(CHAR_OUT, spec.out);
  await io.write(outPath, doc);
  return {out: spec.out, droppedColors, removedProps, joints: jointsBefore};
}

/**
 * anims.glb holds only the six clips and the bones they target (no meshes, no skins). Channels whose value is
 * constant and equal to the rest pose on every character are dropped: those bones never leave rest in any clip,
 * so the character keeps them there anyway. Dropping a channel that varies in some clip would leave the bone
 * stuck mid-crossfade, which is why a channel is dropped only when every clip agrees.
 */
async function buildAnimations(restPoses, jointsRef) {
  const doc = await readFileAt(hoodieSource);
  const root = doc.getRoot();
  const found = root.listAnimations().map((a) => a.getName());
  if (JSON.stringify(sortedUnique(found)) !== JSON.stringify(sortedUnique(CLIPS))) {
    fail(`hoodie animations are ${found.join(',')}, expected ${CLIPS.join(',')}`);
  }
  for (const animation of root.listAnimations()) {
    if (!CLIPS.includes(animation.getName())) disposeAnimation(animation);
  }

  const removable = new Map();
  for (const animation of root.listAnimations()) for (const channel of animation.listChannels()) {
    const node = channel.getTargetNode();
    const target = channel.getTargetPath();
    const key = `${node.getName()}|${target}`;
    const output = channel.getSampler().getOutput();
    const isSame = constantEqualsRest(output, target, restPoses, node.getName());
    removable.set(key, (removable.get(key) ?? true) && isSame);
  }
  let droppedChannels = 0;
  for (const animation of root.listAnimations()) for (const channel of animation.listChannels()) {
    const key = `${channel.getTargetNode().getName()}|${channel.getTargetPath()}`;
    if (removable.get(key)) {
      channel.dispose();
      droppedChannels++;
    }
  }

  const targets = new Set();
  for (const animation of root.listAnimations()) for (const channel of animation.listChannels()) {
    targets.add(channel.getTargetNode());
  }
  const scene = ensureScene(doc);
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const node of [...root.listNodes()]) {
    if (targets.has(node)) {
      const parent = node.getParentNode();
      if (parent) parent.removeChild(node);
      scene.addChild(node);
    }
  }
  for (const node of root.listNodes()) if (!targets.has(node)) node.dispose();
  for (const animation of root.listAnimations()) {
    const used = new Set(animation.listChannels().map((c) => c.getSampler()));
    for (const sampler of animation.listSamplers()) if (!used.has(sampler)) sampler.dispose();
  }
  await doc.transform(prune({keepLeaves: true}));

  const bones = [...targets].map((n) => n.getName()).sort();
  for (const name of bones) {
    if (!jointsRef.includes(name)) fail(`anims target "${name}", which is not a bone in the rig`);
  }
  const rotations = quantizeRotationKeys(doc);
  roundNodeTransforms(doc);
  const outPath = path.join(CHAR_OUT, 'anims.glb');
  await io.write(outPath, doc);
  return {droppedChannels, bones: bones.length, rotations};
}

/**
 * Quaternion keys are unit components in [-1, 1]. Stored as normalised Int16 (KHR_mesh_quantization), they halve the
 * rotation bytes with an error of about 3e-5 per component. three.js GLTFLoader denormalises animation outputs
 * (_getArrayFromAccessor), so no runtime change is needed. Translations stay Float32 because their ranges vary.
 */
function quantizeRotationKeys(doc) {
  const done = new Set();
  let count = 0;
  for (const animation of doc.getRoot().listAnimations()) for (const channel of animation.listChannels()) {
    if (channel.getTargetPath() !== 'rotation') continue;
    const accessor = channel.getSampler().getOutput();
    if (done.has(accessor)) continue;
    done.add(accessor);
    const src = accessor.getArray();
    const dst = new Int16Array(src.length);
    for (let i = 0; i < src.length; i++) dst[i] = Math.round(Math.max(-1, Math.min(1, src[i])) * 32767);
    accessor.setArray(dst);
    accessor.setNormalized(true);
    count++;
  }
  if (count) doc.createExtension(KHRMeshQuantization).setRequired(true);
  return count;
}

function constantEqualsRest(accessor, target, restPoses, nodeName) {
  const k = accessor.getElementSize();
  const values = accessor.getArray();
  const n = accessor.getCount();
  for (let i = 1; i < n; i++) for (let j = 0; j < k; j++) {
    if (Math.abs(values[i * k + j] - values[j]) > 1e-6) return false;
  }
  const rest = restPoses.get(nodeName);
  if (!rest) return false;
  const key = target; // 'translation' | 'rotation' | 'scale'
  return rest.every((pose) => {
    const expected = pose[key];
    if (key === 'rotation') {
      const dot = Math.abs(expected.reduce((s, v, j) => s + v * values[j], 0));
      return dot > 1 - ANIM_EPSILON;
    }
    return expected.every((v, j) => Math.abs(v - values[j]) <= ANIM_EPSILON);
  });
}

async function buildRoom(name, kenneyGltf) {
  const src = path.join(kenneyGltf, `${name}.glb`);
  if (!existsSync(src)) fail(`missing Kenney model ${src}`);
  const doc = await io.read(src);
  const root = doc.getRoot();
  if (root.listTextures().length) fail(`${name} has textures; flat colours are required`);
  if (root.listSkins().length || root.listAnimations().length) fail(`${name} has skins or animations`);
  const scene = ensureScene(doc);
  const before = boundsOf(scene);
  await doc.transform(prune({keepLeaves: true}), dedup({keepUniqueNames: true}), weld(),
    quantize(ROOM_QUANTIZE), prune({keepLeaves: true}), dedup({keepUniqueNames: true}));
  const after = boundsOf(ensureScene(doc));
  const delta = maxBoundsDelta(before, after);
  if (delta > POSITION_EPSILON) fail(`${name} moved by ${delta} during quantisation`);
  const outPath = path.join(ROOM_OUT, `${name}.glb`);
  await io.write(outPath, doc);
  const size = after.max.map((v, i) => v - after.min[i]);
  return {
    name,
    size: size.map(round4),
    min: after.min.map(round4),
    bytes: (await stat(outPath)).size,
    delta,
  };
}

/** Strips props by node name. Each must be bound only to right-hand bones, so no body part or clothing can go. */
function removeProps(doc, outName) {
  const removed = [];
  for (const name of PROPS[outName] ?? []) {
    const nodes = doc.getRoot().listNodes().filter((node) => node.getName() === name && node.getMesh());
    if (nodes.length !== 1) fail(`${outName}: expected one mesh node "${name}", found ${nodes.length}`);
    const node = nodes[0];
    const joints = node.getSkin()?.listJoints();
    if (!joints) fail(`${outName}: "${name}" is not skinned`);
    const materials = new Set();
    for (const prim of node.getMesh().listPrimitives()) {
      const jointIndex = prim.getAttribute('JOINTS_0').getArray();
      const weights = prim.getAttribute('WEIGHTS_0').getArray();
      const count = prim.getAttribute('POSITION').getCount();
      for (let i = 0; i < count; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (weights[i * 4 + k] > weights[i * 4 + best]) best = k;
        const bone = joints[jointIndex[i * 4 + best]].getName();
        if (!HAND_BONE.test(bone)) fail(`${outName}: "${name}" is bound to ${bone}, so it is not a held prop`);
      }
      materials.add(prim.getMaterial()?.getName());
    }
    removed.push(`${name} [${[...materials].sort().join(', ')}]`);
    node.dispose();
  }
  return removed;
}

/** Node transforms rounded to 1e-7 (about float32 precision), so the JSON carries no 17-digit noise. */
function roundNodeTransforms(doc) {
  const r = (v) => Math.round(v * 1e7) / 1e7;
  for (const node of doc.getRoot().listNodes()) {
    node.setTranslation(node.getTranslation().map(r));
    node.setScale(node.getScale().map(r));
    node.setRotation(node.getRotation().map(r));
  }
}

function round4(v) {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

async function verify(referenceJoints) {
  for (const spec of CHARACTERS) {
    const doc = await io.read(path.join(CHAR_OUT, spec.out));
    const root = doc.getRoot();
    if (root.listAnimations().length) fail(`${spec.out} has animations`);
    if (JSON.stringify(jointNamesOf(doc)) !== JSON.stringify(referenceJoints)) fail(`${spec.out} bones differ`);
  }
  const anims = await io.read(path.join(CHAR_OUT, 'anims.glb'));
  const clipNames = sortedUnique(anims.getRoot().listAnimations().map((a) => a.getName()));
  if (JSON.stringify(clipNames) !== JSON.stringify(sortedUnique(CLIPS))) fail('anims.glb has the wrong clips');
  const nodeNames = anims.getRoot().listNodes().map((n) => n.getName());
  for (const name of nodeNames) {
    if (!referenceJoints.includes(name)) fail(`anims.glb node "${name}" is not a bone in every character`);
  }
}

async function main() {
  const [quaternius, kenneyKit, hoodieArg] = process.argv.slice(2);
  if (!quaternius || !kenneyKit || !hoodieArg) {
    console.error('usage: node tools/build-assets.mjs <quaternius-dir> <kenney-kit-dir> <Casual_Hoodie.glb>');
    process.exit(2);
  }
  hoodieSource = path.resolve(hoodieArg);
  if (!existsSync(hoodieSource)) fail(`missing hoodie source ${hoodieSource}`);
  const quaterniusDir = path.resolve(quaternius);
  const kenneyDir = path.resolve(kenneyKit);
  const kenneyGltf = path.join(kenneyDir, 'Models', 'GLTF format');
  const kenneyLicense = path.join(kenneyDir, 'License.txt');
  if (!existsSync(kenneyLicense) || !existsSync(kenneyGltf)) fail(`not a Kenney kit folder: ${kenneyDir}`);

  await mkdir(CHAR_OUT, {recursive: true});
  await mkdir(ROOM_OUT, {recursive: true});
  await mkdir(LICENSE_OUT, {recursive: true});

  // Rig reference: every character must share the hoodie's exact joint names and order.
  const hoodieDoc = await readFileAt(hoodieSource);
  const referenceJoints = jointNamesOf(hoodieDoc);
  const restPoses = new Map(referenceJoints.map((name) => [name, []]));
  for (const spec of CHARACTERS) {
    const doc = await readFileAt(sourcePath(spec, quaterniusDir));
    if (JSON.stringify(jointNamesOf(doc)) !== JSON.stringify(referenceJoints)) fail(`${spec.file} rig differs from hoodie`);
    for (const [name, pose] of restPoseOf(doc)) restPoses.get(name).push(pose);
  }

  const animReport = await buildAnimations(restPoses, referenceJoints);
  console.log(`anims.glb: ${animReport.bones} bones, ${animReport.droppedChannels} constant-at-rest channels dropped, ` +
    `${animReport.rotations} rotation outputs as Int16`);

  for (const spec of CHARACTERS) {
    const report = await buildCharacter(spec, quaterniusDir);
    const props = report.removedProps.length ? `; props removed: ${report.removedProps.join('; ')}` : '';
    console.log(`${report.out}: ${report.droppedColors} vertex-colour set dropped (all white)${props}`);
  }

  const rooms = [];
  for (const name of ROOM_MODELS) rooms.push(await buildRoom(name, kenneyGltf));
  const manifest = {};
  for (const room of rooms) manifest[room.name] = {size: room.size, min: room.min, bytes: room.bytes};
  await writeFile(path.join(ROOM_OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await copyFile(kenneyLicense, path.join(LICENSE_OUT, 'Kenney.txt'));

  await verify(referenceJoints);
  console.log(`room: ${rooms.length} models, largest bounds delta ${Math.max(...rooms.map((r) => r.delta)).toExponential(2)}`);
  console.log('verified: characters, anims.glb bones, room manifest');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
