'use strict';
/*
 * 轻量 DOM 桩：在无浏览器环境下加载 public/app.js，
 * 驱动“建格→标注→合法/非法折叠→回放→顺序→存取载荷”主流程冒烟。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const FE = require('../public/foldEngine.js');

function makeEl(id) {
  const listeners = {};
  const el = {
    id, hidden: false, value: '', textContent: '', innerHTML: '',
    style: { cssText: '', setProperty() {} }, className: '', disabled: false,
    dataset: {}, files: [], max: '0',
    width: 0, height: 0,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatch(t, ev = {}) { (listeners[t] || []).forEach((fn) => fn(ev)); },
    click() {},
    appendChild() {}, append() {}, querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    removeAttribute() {}, setAttribute() {},
    options: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    getContext: () => ({
      setTransform() {}, clearRect() {}, save() {}, restore() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
      arcTo() {}, closePath() {}, fillText() {}, translate() {}, rotate() {},
      rect() {}, set fillStyle(v) {}, get fillStyle() { return ''; },
      set strokeStyle(v) {}, get strokeStyle() { return ''; },
      set lineWidth(v) {}, get lineWidth() { return 1; },
      set font(v) {}, get font() { return ''; },
      set textAlign(v) {}, set textBaseline(v) {},
      measureText: () => ({ width: 40 }),
      setLineDash() {}
    }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };
  // 桩保真：设置 innerHTML 时同步一份去标签的 textContent（app 常用 innerHTML、断言看 textContent）
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(v) { html = String(v); el.textContent = html.replace(/<[^>]*>/g, ''); }
  });
  return el;
}

const ids = ['rowsInput', 'colsInput', 'createGridBtn', 'axisSelect', 'lineSelect',
  'foldError', 'saveBtn', 'exportBtn', 'importBtn', 'importFile', 'loadListBtn',
  'deletePlanBtn', 'planList', 'saveMsg', 'firstBtn', 'prevBtn', 'playBtn', 'nextBtn',
  'stepSlider', 'stepLabel', 'statusBadge', 'board', 'canvasHint', 'stepList',
  'delStepBtn', 'clearStepsBtn', 'orientInfo', 'sequenceBox', 'foldState',
  'cellEditor', 'editorOrigin', 'editorRows', 'editorCancel', 'editorOk', 'planName',
  'imposeStart', 'imposeCount', 'imposePreviewBtn', 'imposeStatus', 'imposePreview',
  'imposeSummary', 'imposeOverwrite', 'imposeRows', 'imposeCancelBtn', 'imposeConfirmBtn',
  'pathCell', 'pathFace', 'pathSearchBtn', 'pathStatus', 'pathResults',
  'trackCell', 'trackFace', 'trackStatus', 'trackTimeline',
  'duplexCard', 'duplexFlip', 'duplexOpenBtn', 'duplexStatus',
  'duplexOverlay', 'duplexFlipOverlay', 'duplexScreenNote', 'duplexPrintBtn',
  'duplexCloseBtn', 'plateFrontMeta', 'plateBackMeta', 'plateFrontSheet',
  'plateBackSheet',
  'auditCard', 'auditVerdict', 'auditStatus', 'auditFindings', 'auditExportBtn'];
const els = Object.fromEntries(ids.map((id) => [id, makeEl(id)]));
els.rowsInput.value = '2';
els.colsInput.value = '2';
els.planName.value = '冒烟方案';
els.axisSelect.value = 'v';
els.duplexFlip.value = 'long';
els.duplexFlipOverlay.value = 'long';

const foldBtns = ['l', 'r', 'u', 'd'].map((dir) => {
  const b = makeEl('fold-' + dir);
  b.dataset.dir = dir;
  return b;
});

const win = { devicePixelRatio: 1, addEventListener() {} };
const sandbox = {
  console,
  window: win,
  document: {
    getElementById: (id) => els[id],
    querySelectorAll: (sel) => sel === 'button.fold' ? foldBtns : [],
    createElement: () => makeEl('dyn')
  },
  fetch: async () => ({ json: async () => ({ ok: false }) }),
  Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  FileReader: class { readAsText() {} },
  alert() {}, confirm() { return false; },
  setTimeout, clearInterval, setInterval: () => 1
};
vm.createContext(sandbox);
// foldEngine 通过 window.FoldEngine 暴露；让 window 也成为全局对象的一部分
sandbox.window.FoldEngine = undefined;

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'foldEngine.js'), 'utf8'), sandbox);
vm.runInContext('var FoldEngine = window.FoldEngine;', sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'), sandbox);
const ui = sandbox.window.__foldApp;

// init() 已在 app.js 末尾执行：默认创建了 2×2 网格
assert.equal(ui.plan.rows, 2);
assert.equal(ui.plan.cols, 2);

// 模拟添加合法竖折（左瓣向右落）
ui.plan.labels = {
  '0,0': { front: '4', back: '5' }, '1,0': { front: '6', back: '3' },
  '0,1': { front: '8', back: '1' }, '1,1': { front: '7', back: '2' }
};
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
assert.equal(ui.plan.steps.length, 1);
assert.equal(els.foldError.hidden, true);

// 非法折：水平方向用左右方向不匹配，由表单分支处理；直接给厚度冲突
// 先加合法水平折，再试图重复 -> contour
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
assert.equal(ui.plan.steps.length, 2);
ui.requestStep({ axis: 'h', line: 1, dir: 'd' }); // 上瓣已空
assert.equal(ui.plan.steps.length, 2, '非法步骤不应入列');
assert.equal(els.foldError.hidden, false);

// 回放与阅读顺序
ui.setUpto(0);
assert.equal(ui.upto, 0);
ui.setUpto(2);
const seq = FE.pageSequence(ui.replay.state).stacks[0].sequence;
assert.deepEqual(seq, ['3', '4', '1', '7', '2', '8', '5', '6']);
assert.ok(/单叠|阅读顺序/.test(els.foldState.textContent), '折叠状态已渲染');

// 厚度冲突场景（1×3）
els.rowsInput.value = '1'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'v', line: 2, dir: 'l' });
assert.equal(ui.plan.steps.length, 1, '厚度冲突步应被拒绝');
assert.ok(els.foldError.textContent.includes('厚度不一致'));
assert.ok(ui.replay.error.code === 'thickness');
assert.deepEqual(ui.replay.error.conflicts, ['2,0', '1,0']);

// ---------- 自动拼版 ----------
// 非法折叠场景：生成被禁用。被拒绝的折法不会写入步骤，因此这里直接置入
// 一条非法步骤（等价于导入含非法折叠的方案）后重渲染。
ui.plan.steps.push({ axis: 'v', line: 2, dir: 'l' });   // 1 层压向 2 层：厚度冲突
ui.render();
assert.equal(ui.imposition.eligible.ok, false);
assert.equal(ui.imposition.eligible.code, 'thickness');
assert.equal(els.imposePreviewBtn.disabled, true);
assert.ok(els.imposeStatus.textContent.includes('禁用生成'));
ui.plan.steps.pop();   // 恢复为只有合法首步的状态

// 未收成单叠场景（2×3 只折一次）
els.rowsInput.value = '2'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
assert.equal(ui.imposition.eligible.ok, false);
assert.equal(ui.imposition.eligible.code, 'not_single_stack');
assert.equal(els.imposePreviewBtn.disabled, true);

// 合法 2×2 折帖：v1 右折 + h1 下折，收成 8 面单叠
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
assert.equal(ui.imposition.eligible.ok, true);
assert.equal(ui.imposition.eligible.capacity, 8);
assert.equal(els.imposePreviewBtn.disabled, false);

// 页数超出容量：引擎拒绝，不出预览
els.imposeStart.value = '1';
els.imposeCount.value = '9';
els.imposePreviewBtn.dispatch('click');
assert.equal(ui.imposition.result, null);
assert.ok(els.imposeStatus.textContent.includes('超出纸格总面数'));
assert.equal(els.imposePreview.hidden, true);

// 生成预览：不得直接改动当前标注
els.imposeCount.value = '8';
els.imposePreviewBtn.dispatch('click');
assert.ok(ui.imposition.result && ui.imposition.result.ok);
assert.deepEqual(ui.plan.labels, {}, '预览阶段标注不得被修改');
assert.equal(els.imposePreview.hidden, false);
assert.equal(ui.imposition.result.blankTrailing, 0);

// 确认写入后：阅读序列为连续 1..8，反向映射正确（1×2 例与手工标注一致）
els.imposeConfirmBtn.dispatch('click');
const imposedSeq = FE.pageSequence(ui.replay.state).stacks[0].sequence;
assert.deepEqual(imposedSeq, ['1', '2', '3', '4', '5', '6', '7', '8']);
assert.deepEqual(ui.plan.labels['0,1'], { front: '6', back: '3' });

// 部分页数 4：末尾 4 槽空白，被空白的面在预览中可定位
ui.plan.labels = {};
ui.render();
els.imposeCount.value = '4';
els.imposePreviewBtn.dispatch('click');
assert.equal(ui.imposition.result.blankTrailing, 4);
const blankSlots = ui.imposition.result.slots.filter((s) => s.blank);
assert.equal(blankSlots.length, 4);
assert.ok(blankSlots.every((s) => s.origin && s.face));

// 现有标注非空：确认前覆盖汇总非空（confirm 在桩中返回 false，不会误写入）
ui.plan.labels = { '0,0': { front: '99', back: '98' } };
ui.render();
els.imposePreviewBtn.dispatch('click');
assert.equal(els.imposeOverwrite.hidden, false);
assert.ok(els.imposeOverwrite.textContent.includes('0,0'));
els.imposeConfirmBtn.dispatch('click');
assert.equal(ui.plan.labels['0,0'].front, '99', '未确认时不得覆盖现有标注');

// 确认后旧预览作废：再改回干净标注、重新确认（绕过 confirm 直接调用）
ui.plan.labels = {};
ui.render();
els.imposeCount.value = '8';
els.imposePreviewBtn.dispatch('click');
ui.confirmImposition();   // 无现有标注，不弹确认框
assert.deepEqual(FE.pageSequence(ui.replay.state).stacks[0].sequence,
  ['1', '2', '3', '4', '5', '6', '7', '8']);

// ---------- 双面印刷版预览 ----------
// 合法 2×2 折帖 + 已确认拼版标注：预览按钮可用
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
assert.equal(els.duplexOpenBtn.disabled, false);

// 长边版：正面不镜像、背面左右镜像；格位旋转与引擎朝向一致
ui.openDuplex();
assert.equal(els.duplexOverlay.hidden, false);
let plate = ui.duplex.result;
assert.equal(plate.flip, 'long');
assert.equal(plate.front.grid[0][0].origin, '0,0');
assert.equal(plate.back.grid[0][0].origin, '1,0');
assert.equal(plate.back.grid[0][1].origin, '0,0');
assert.equal(plate.back.grid[1][0].origin, '1,1');
assert.equal(plate.front.edge, 'right');
assert.equal(plate.back.edge, 'left');
// frame.y.y<0 的格（如 0,0 / 1,0）正面版旋转 180°；0,1 / 1,1 不转
assert.equal(plate.front.grid[0][0].rotate, 180);
assert.equal(plate.front.grid[0][1].rotate, 180);
assert.equal(plate.front.grid[1][0].rotate, 0);
assert.equal(plate.front.grid[1][1].rotate, 0);
assert.ok(plate.front.grid.flat().every((c) => c.face === 'front'));
assert.ok(plate.back.grid.flat().every((c) => c.face === 'back'));
// 长边反面版与正面版旋转规则相同
assert.equal(plate.back.grid[0][0].rotate, 180);
assert.equal(plate.back.grid[1][1].rotate, 0);

// 切短边：改为上下镜像、翻面边变为横边
els.duplexFlipOverlay.value = 'short';
els.duplexFlipOverlay.dispatch('change', { target: els.duplexFlipOverlay });
plate = ui.duplex.result;
assert.equal(plate.flip, 'short');
assert.equal(plate.back.grid[0][0].origin, '0,1');
assert.equal(plate.back.grid[0][1].origin, '1,1');
assert.equal(plate.back.grid[1][0].origin, '0,0');
assert.equal(plate.back.grid[1][1].origin, '1,0');
assert.equal(plate.front.edge, 'top');
assert.equal(plate.back.edge, 'bottom');
// 短边反面版旋转规则与长边相反：0,0 在长边为 180°，短边为 0°
assert.equal(plate.back.grid[1][0].rotate, 0);
assert.equal(plate.back.grid[0][1].rotate, 180);
assert.equal(plate.front.grid[0][0].rotate, 180, '正面版旋转不随翻面方式变化');
ui.closeDuplex();
assert.equal(els.duplexOverlay.hidden, true);

// 未收成单叠时禁用并说明原因
els.rowsInput.value = '2'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
assert.equal(els.duplexOpenBtn.disabled, true);
assert.ok(/尚未收成单叠/.test(els.duplexStatus.textContent));

// 非法折叠时禁用并给出原因（厚度冲突）
els.rowsInput.value = '1'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.plan.steps.push({ axis: 'v', line: 2, dir: 'l' });
ui.renderDuplex();
assert.equal(els.duplexOpenBtn.disabled, true);
assert.ok(/禁用预览/.test(els.duplexStatus.textContent));

// 打开预览后方案被改坏 → 自动关闭
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
ui.openDuplex();
assert.equal(els.duplexOverlay.hidden, false);
ui.plan.steps.push({ axis: 'v', line: 1, dir: 'r' });
ui.renderDuplex();
assert.equal(els.duplexOverlay.hidden, true);

// ---------- 折手自动寻路 ----------
// 干净 2×2：寻路按钮可用，目标 (1,0) 反面 → 2 步最短，给出 ≤3 条等长方案
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
assert.equal(ui.plan.rows, 2);
assert.equal(els.pathSearchBtn.disabled, false);
els.pathCell.value = '1,0';
els.pathFace.value = 'back';
ui.doPathfindSearch();
assert.ok(ui.pathfind.result && ui.pathfind.result.solved, '寻路应成功');
assert.equal(ui.pathfind.result.depth, 2);
assert.ok(ui.pathfind.result.solutions.length >= 2);
assert.ok(ui.pathfind.result.solutions.length <= 3);
for (const sol of ui.pathfind.result.solutions) assert.equal(sol.steps.length, 2);
assert.ok(/最短/.test(els.pathStatus.textContent));
assert.equal(els.pathResults.hidden, false);

// 追加任一方案到当前步骤：进入末态回放，收成单叠、封面正确
const firstSol = ui.pathfind.result.solutions[0];
const before = ui.plan.steps.length;
ui.appendPathSolution(firstSol);
assert.equal(ui.plan.steps.length, before + 2);
assert.equal(ui.upto, ui.plan.steps.length);
const finalCells = Object.keys(ui.replay.state.stacks);
assert.equal(finalCells.length, 1);
const topPanel = ui.replay.state.panels[ui.replay.state.stacks[finalCells[0]][0]];
assert.equal(topPanel.ox + ',' + topPanel.oy, '1,0');
assert.ok(topPanel.frame.n.z < 0);
assert.equal(ui.pathfind.result, null, '追加后旧寻路结果作废');

// 无解目标（正面封面）：状态文字提示“无解”，不展示方案
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
els.pathCell.value = '0,0';
els.pathFace.value = 'front';
ui.doPathfindSearch();
assert.equal(ui.pathfind.result.solved, false);
assert.equal(ui.pathfind.result.reason, 'no_solution');
assert.ok(els.pathStatus.textContent.includes('无解'));
assert.equal(els.pathResults.hidden, true);

// 超过 4×4：搜索按钮禁用并给出原因
els.rowsInput.value = '3'; els.colsInput.value = '5';
els.createGridBtn.dispatch('click');
assert.equal(ui.plan.cols, 5, '输入框 5 在 1..12 范围内应被接受');
ui.renderPathfind();
assert.equal(els.pathSearchBtn.disabled, true);
assert.ok(els.pathStatus.textContent.includes('4×4'));

// 前缀非法折叠时寻路禁用
els.rowsInput.value = '1'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'v', line: 2, dir: 'l' });   // 厚度冲突，被拒绝
assert.equal(ui.plan.steps.length, 1);
// 只有 1 步合法，末态合法可寻路；制造一个真正的非法前缀：直接塞入非法步
ui.plan.steps.push({ axis: 'v', line: 2, dir: 'l' });
ui.renderPathfind();
assert.equal(els.pathSearchBtn.disabled, true);
assert.ok(/非法/.test(els.pathStatus.textContent));

// ---------- 面片轨迹 ----------
// 干净 2×2 折帖（v1 右折 + h1 下折），追踪原格 0,0 的正面
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
els.trackCell.value = '0,0';
els.trackFace.value = 'front';
ui.renderTrack('0,0', 'front');
assert.ok(ui.track.result && ui.track.result.ok, '轨迹应计算成功');
assert.equal(ui.track.result.completed, true);
assert.equal(ui.track.result.interrupted, null);
assert.equal(ui.track.result.points.length, 3);
assert.deepEqual(ui.track.result.points.map((p) => p.cell), ['0,0', '1,0', '1,1']);
assert.deepEqual(ui.track.result.points.map((p) => [p.layer, p.depth]), [[1, 1], [1, 2], [2, 4]]);
assert.deepEqual(ui.track.result.points.map((p) => p.faceUp), [true, false, true]);
assert.deepEqual(ui.track.result.points.map((p) => p.upright), [true, true, false]);
assert.equal(els.trackTimeline.hidden, false);
assert.ok(/中断/.test(els.trackStatus.textContent) === false);

// 点击第 1 步节点：联动既有回放定位，画布上按原始身份高亮该片
ui.jumpTrackPoint(1);
assert.equal(ui.upto, 1);
const info1 = ui.currentTrackInfo(ui.replay.state);
assert.equal(info1.id, '0,0');
assert.equal(info1.cell, '1,0');
assert.equal(info1.layer, 1);
assert.equal(info1.depth, 2);
// 末步节点：该片已合并入终叠第二层
ui.jumpTrackPoint(2);
const info2 = ui.currentTrackInfo(ui.replay.state);
assert.equal(info2.cell, '1,1');
assert.equal(info2.layer, 2);
assert.equal(info2.depth, 4);
assert.deepEqual(Object.keys(ui.replay.state.stacks), ['1,1']);

// 切到反面追踪：第 1 步反面朝上
ui.renderTrack('0,0', 'back');
assert.equal(ui.track.target.face, 'back');
assert.deepEqual(ui.track.result.points.map((p) => p.faceUp), [false, true, false]);

// 网格、标注或步骤变化后自动重算（标注变化页码随之更新）
ui.plan.labels = { '0,0': { front: '4', back: '1' } };
ui.renderTrack();
assert.equal(ui.track.result.target.face, 'back');
assert.equal(ui.track.result.points[0].label, '1');   // 标签随面片身份携带
assert.equal(ui.track.result.points[1].label, '1');

// 首个非法步骤：保留此前节点并标明中断原因
els.rowsInput.value = '1'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.plan.steps.push({ axis: 'v', line: 1, dir: 'r' });   // 合法：0 列叠入 1 列（2 层）
ui.plan.steps.push({ axis: 'v', line: 2, dir: 'l' });   // 1 层压向 2 层：厚度冲突
ui.renderTrack('0,0', 'front');
assert.equal(ui.track.result.completed, false);
assert.deepEqual(ui.track.result.points.map((p) => p.step), [0, 1]);
assert.equal(ui.track.result.interrupted.stepIndex, 1);
assert.equal(ui.track.result.interrupted.code, 'thickness');
assert.deepEqual(ui.track.result.interrupted.conflicts, ['2,0', '1,0']);
assert.ok(/中断/.test(els.trackStatus.textContent));
// 回放在非法步时：节点定位到中断前最后一步，画布里身份仍可追踪
ui.setUpto(2, true);
assert.ok(ui.replay.error, '回放在非法步应带错误');
const stalledInfo = ui.currentTrackInfo(ui.replay.state);
assert.equal(stalledInfo.cell, '1,0');
assert.equal(stalledInfo.depth, 2);
ui.jumpTrackPoint(0);
assert.equal(ui.upto, 0);
assert.equal(ui.currentTrackInfo(ui.replay.state).cell, '0,0');

// 目标非法（网格切换后旧选择失效由下拉重建兜底；直接构造越界）
const badTarget = FE.trackPanel(1, 3, {}, [], { cell: '9,9', face: 'front' });
assert.equal(badTarget.ok, false);
assert.equal(badTarget.code, 'bad_target');

// ---------- 生产质量审计 ----------
// 干净 1×2 折帖：全部检查通过，结论可发布，可导出报告
els.rowsInput.value = '1'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.plan.labels = { '0,0': { front: '4', back: '1' }, '1,0': { front: '2', back: '3' } };
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
assert.equal(ui.audit.result.ok, true);
assert.equal(ui.audit.result.verdict, 'pass');
assert.equal(ui.audit.result.summary.total, 0);
assert.ok(/可发布/.test(els.auditVerdict.textContent));
assert.equal(els.auditExportBtn.disabled, false);
assert.equal(els.auditFindings.hidden, false);
ui.exportAudit();   // 桩环境（Blob/URL/click 已桩）下不抛错
assert.ok(/审计报告/.test(els.saveMsg.textContent));

// 重复 + 空白 + 未覆盖 + 倒置：结论需修订，分级结果入列
els.rowsInput.value = '2'; els.colsInput.value = '2';
els.createGridBtn.dispatch('click');
ui.plan.labels = {
  '0,0': { front: '1', back: '2' },
  '1,0': { front: '1', back: '' }   // 与 0,0 正面重复；反面空白；0,1 / 1,1 整格未覆盖
};
ui.requestStep({ axis: 'v', line: 1, dir: 'r' });
ui.requestStep({ axis: 'h', line: 1, dir: 'd' });
assert.equal(ui.audit.result.ok, true);
assert.equal(ui.audit.result.verdict, 'fail');
const auditIds = new Set(ui.audit.result.findings.map((f) => f.id));
assert.ok(auditIds.has('duplicate_page'));
assert.ok(auditIds.has('blank_page'));
assert.ok(auditIds.has('uncovered_cell'));
assert.ok(auditIds.has('inverted_page'));
assert.ok(/需修订/.test(els.auditVerdict.textContent));
assert.ok(/错误/.test(els.auditStatus.textContent));

// 非法步骤：审计中止，仅报告首个错误，不展示后续结论
els.rowsInput.value = '1'; els.colsInput.value = '3';
els.createGridBtn.dispatch('click');
ui.plan.steps.push({ axis: 'v', line: 1, dir: 'r' });   // 合法
ui.plan.steps.push({ axis: 'v', line: 2, dir: 'l' });   // 厚度冲突
ui.render();
assert.equal(ui.audit.result.ok, false);
assert.equal(ui.audit.result.code, 'thickness');
assert.equal(ui.audit.result.stepIndex, 1);
assert.ok(/审计中止/.test(els.auditVerdict.textContent));
assert.ok(/首个错误/.test(els.auditStatus.textContent));
assert.equal(els.auditFindings.hidden, true, '中止时不展示结论列表');

// 修正非法步骤后自动恢复审计
ui.plan.steps.pop();
ui.render();
assert.equal(ui.audit.result.ok, true);

console.log('前端冒烟流程全部通过');
