// ============================================================
// AO3 排版助手 - 逻辑脚本
// 全部纯前端实现，不依赖任何第三方库。
// ============================================================

(function () {
  'use strict';

  // ---------- 常量 ----------

  // 导出时允许保留的 class 名单（对应配套 Work Skin 里的样式）
  // 行距/段距不再是按段落挑选的 class，而是全文级别的数值设置，见下面的 currentLH / currentSP
  const WHITELIST_CLASSES = [
    'fs-large', 'fs-small',
    'indent'
  ];

  // 导出时允许保留的标签（大写，DOM tagName 是大写的）
  const KEEP_TAGS = new Set(['P', 'STRONG', 'EM', 'BLOCKQUOTE', 'BR', 'HR', 'UL', 'OL', 'LI']);

  // 同一类里的 class 互斥（点一个会把同类的其它 class 去掉）
  // 注意：fs-normal 不在白名单里，是"恢复默认"的意思，导出时会自动被剥离
  const CLASS_CATEGORY = {
    'fs-large': 'fs', 'fs-normal': 'fs', 'fs-small': 'fs'
  };

  // 行距 / 段距：全文级别的数值，不需要选中，随时可调，实时生效
  let currentLH = 1.6;  // 行距倍数
  let currentSP = 1;    // 段落上下间距，单位 em

  function buildCssCommentBlock() {
    return (
      '<!-- \n' +
      '把下面这段 CSS 粘贴到 AO3 的 Work Skin 里：\n' +
      'Dashboard -> Skins -> Create Work Skin -> 粘贴 -> 保存。\n' +
      '然后在作品编辑页面的 "Select Work Skin" 里选这个皮肤。\n' +
      '\n' +
      '#workskin p, #workskin li, #workskin blockquote {\n' +
      '  line-height: ' + currentLH + ';\n' +
      '  margin-top: ' + currentSP + 'em;\n' +
      '  margin-bottom: ' + currentSP + 'em;\n' +
      '}\n' +
      '#workskin .fs-large { font-size: 1.3em; }\n' +
      '#workskin .fs-small { font-size: 0.85em; }\n' +
      '#workskin .indent { text-indent: 2em; }\n' +
      '-->'
    );
  }

  // ---------- 元素引用 ----------
  const rawInput = document.getElementById('rawInput');
  const previewArea = document.getElementById('previewArea');
  const loadBtn = document.getElementById('loadBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const statusMsg = document.getElementById('statusMsg');
  const lhRange = document.getElementById('lhRange');
  const lhNumber = document.getElementById('lhNumber');
  const spRange = document.getElementById('spRange');
  const spNumber = document.getElementById('spNumber');

  let statusTimer = null;
  function setStatus(text) {
    statusMsg.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusMsg.textContent = ''; }, 3000);
  }

  // ---------- 小工具函数 ----------

  // 把纯文本里的 < > & 转义，避免用户粘贴的文字被当成 HTML 标签
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---------- ① 载入到预览区：按换行符分段（每一行就是一段，空行保留为空段落，默认首行缩进） ----------
  loadBtn.addEventListener('click', () => {
    const text = rawInput.value;
    if (!text.trim()) {
      setStatus('左边还没有输入文字哦');
      return;
    }
    // 每一行都算一段，空行不再跳过，而是保留成一个空段落，
    // 这样行距/段距（作用在每个 p 上）对空行也同样生效。
    // 载入时默认不加首行缩进（class="indent"），避免和用户手动打的缩进重复；
    // 缩进统一交给右侧「首行缩进」按钮：不选中文字点击 = 对全文生效，
    // 选中某几段再点击 = 只对选中的段落单独开关。
    const lines = text.split('\n').map(p => p.trim());

    const html = lines
      .map(p => '<p>' + (p.length > 0 ? escapeHtml(p) : '&nbsp;') + '</p>')
      .join('\n');

    previewArea.innerHTML = html;
    setStatus('已载入 ' + lines.length + ' 段到预览区');
  });

  // ---------- 获取选区涉及到的"块级元素"（预览区的直接子元素） ----------
  // 例如选中的文字横跨两个 <p>，就会返回这两个 <p>
  function getBlockAncestor(node) {
    let el = node.nodeType === 3 ? node.parentNode : node;
    while (el && el !== previewArea && el.parentElement !== previewArea) {
      el = el.parentElement;
    }
    return (el === previewArea || !el) ? null : el;
  }

  function getSelectedBlocks() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return [];
    const range = sel.getRangeAt(0);
    if (!previewArea.contains(range.commonAncestorContainer)) return [];

    const startBlock = getBlockAncestor(range.startContainer);
    const endBlock = getBlockAncestor(range.endContainer);
    if (!startBlock || !endBlock) return [];

    const siblings = Array.from(previewArea.children);
    const startIdx = siblings.indexOf(startBlock);
    const endIdx = siblings.indexOf(endBlock);
    if (startIdx === -1 || endIdx === -1) return [startBlock];

    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    return siblings.slice(lo, hi + 1);
  }

  // 给选中的块级元素设置某个"互斥类别"里的 class（比如字号、行距、段距）
  function applyExclusiveClass(cls) {
    const blocks = getSelectedBlocks();
    if (blocks.length === 0) {
      setStatus('请先在预览区选中一段文字');
      return;
    }
    const category = CLASS_CATEGORY[cls];
    blocks.forEach(block => {
      Object.keys(CLASS_CATEGORY).forEach(c => {
        if (CLASS_CATEGORY[c] === category) block.classList.remove(c);
      });
      block.classList.add(cls);
    });
    setStatus('已应用格式：' + cls);
  }

  // 给选中的块级元素开关某个 class（目前只有首行缩进用到）
  // 没有选中任何文字时，默认对预览区里的全部段落生效
  function toggleClass(cls) {
    let blocks = getSelectedBlocks();
    let wholeDoc = false;

    if (blocks.length === 0) {
      blocks = Array.from(previewArea.children);
      wholeDoc = true;
    }
    if (blocks.length === 0) {
      setStatus('预览区还没有内容');
      return;
    }

    const allHave = blocks.every(b => b.classList.contains(cls));
    blocks.forEach(b => b.classList.toggle(cls, !allHave));

    if (wholeDoc) {
      setStatus(allHave ? '已取消全文首行缩进' : '已开启全文首行缩进');
    } else {
      setStatus(allHave ? '已取消首行缩进' : '已开启首行缩进');
    }
  }

  // 引用：把选中的段落包一层 <blockquote>；再点一次取消
  function toggleBlockquote() {
    const blocks = getSelectedBlocks();
    if (blocks.length === 0) {
      setStatus('请先在预览区选中要引用的段落');
      return;
    }
    blocks.forEach(block => {
      if (block.tagName === 'BLOCKQUOTE') {
        // 取消引用：还原成普通段落
        const innerP = block.querySelector(':scope > p');
        const p = document.createElement('p');
        if (innerP) {
          p.className = innerP.className;
          p.innerHTML = innerP.innerHTML;
        } else {
          p.innerHTML = block.innerHTML;
        }
        block.replaceWith(p);
      } else {
        // 应用引用
        const bq = document.createElement('blockquote');
        const p = document.createElement('p');
        p.className = block.className;
        p.innerHTML = block.innerHTML;
        bq.appendChild(p);
        block.replaceWith(bq);
      }
    });
    setStatus('已切换引用格式');
  }

  // 清除选中文字的格式（去掉加粗/斜体等），只保留纯文本
  function clearSelectionFormat() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setStatus('请先选中要清除格式的文字');
      return;
    }
    const range = sel.getRangeAt(0);
    if (!previewArea.contains(range.commonAncestorContainer)) {
      setStatus('请在预览区选中文字');
      return;
    }
    const plainText = range.toString();
    range.deleteContents();
    range.insertNode(document.createTextNode(plainText));
    setStatus('已清除选中文字的格式');
  }

  // ---------- 右侧按钮：统一绑定 ----------
  document.querySelectorAll('.options-panel [data-action]').forEach(btn => {
    // 关键修复：阻止按钮在 mousedown 时抢走 contenteditable 的焦点。
    // 如果不加这一句，鼠标刚按下时浏览器就会把焦点切到按钮上，
    // 预览区里刚选中的文字会立刻"取消选中"，等 click 事件触发时
    // 选区已经没了，后面的格式化操作找不到目标段落，表现为"点击没反应"。
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      previewArea.focus();

      switch (action) {
        case 'bold':
          document.execCommand('bold');
          break;
        case 'italic':
          document.execCommand('italic');
          break;
        case 'blockquote':
          toggleBlockquote();
          break;
        case 'fs-large':
        case 'fs-normal':
        case 'fs-small':
          applyExclusiveClass(action);
          break;
        case 'indent':
          toggleClass('indent');
          break;
        case 'clear-format':
          clearSelectionFormat();
          break;
        case 'undo':
          document.execCommand('undo');
          break;
        default:
          break;
      }
    });
  });

  // ---------- 行距 / 段距：全文级别，不需要选中，滑块和数字框互相同步，实时生效 ----------
  const dynamicStyleTag = document.createElement('style');
  dynamicStyleTag.id = 'dynamicPreviewSpacing';
  document.head.appendChild(dynamicStyleTag);

  function updatePreviewSpacing() {
    dynamicStyleTag.textContent =
      '.preview-area p, .preview-area li, .preview-area blockquote {' +
      'line-height: ' + currentLH + ';' +
      'margin-top: ' + currentSP + 'em;' +
      'margin-bottom: ' + currentSP + 'em;' +
      '}';
  }

  function clampNumber(value, min, max, fallback) {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  lhRange.addEventListener('input', () => {
    currentLH = clampNumber(lhRange.value, 1, 3, currentLH);
    lhNumber.value = currentLH;
    updatePreviewSpacing();
  });
  lhNumber.addEventListener('input', () => {
    currentLH = clampNumber(lhNumber.value, 1, 3, currentLH);
    lhRange.value = currentLH;
    updatePreviewSpacing();
  });

  spRange.addEventListener('input', () => {
    currentSP = clampNumber(spRange.value, 0, 3, currentSP);
    spNumber.value = currentSP;
    updatePreviewSpacing();
  });
  spNumber.addEventListener('input', () => {
    currentSP = clampNumber(spNumber.value, 0, 3, currentSP);
    spRange.value = currentSP;
    updatePreviewSpacing();
  });

  updatePreviewSpacing(); // 页面载入时先按默认值生效一次

  // ---------- 导出：清洗 HTML，只留白名单标签和白名单 class ----------
  function sanitizeForExport(sourceHtml) {
    const container = document.createElement('div');
    container.innerHTML = sourceHtml;

    // 后序遍历：先处理子节点，再处理自己，这样"展开不允许的标签"时
    // 子节点已经是干净的了
    function walk(node) {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 1) {
          walk(child);
          normalizeElement(child);
        }
      });
    }

    function normalizeElement(el) {
      // 浏览器的加粗/斜体命令有时会生成 <b> <i>，统一换成 <strong> <em>
      let tag = el.tagName;
      if (tag === 'B') tag = 'STRONG';
      if (tag === 'I') tag = 'EM';

      // 只保留白名单里的 class，其它属性（style、id...）全部去掉
      const keptClasses = (el.getAttribute('class') || '')
        .split(/\s+/)
        .filter(c => WHITELIST_CLASSES.includes(c));

      Array.from(el.attributes).forEach(attr => el.removeAttribute(attr.name));
      if (keptClasses.length > 0) {
        el.setAttribute('class', keptClasses.join(' '));
      }

      if (!KEEP_TAGS.has(tag)) {
        // 不在白名单里的标签（比如 DIV、SPAN、FONT）：只保留内容，标签本身去掉
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        return;
      }

      if (tag !== el.tagName) {
        // 需要改标签名（B -> STRONG，I -> EM）
        const replacement = document.createElement(tag);
        if (el.hasAttribute('class')) {
          replacement.setAttribute('class', el.getAttribute('class'));
        }
        while (el.firstChild) replacement.appendChild(el.firstChild);
        el.parentNode.replaceChild(replacement, el);
      }
    }

    walk(container);
    return container;
  }

  // 拼出完整的导出文本：说明注释 + CSS 在前，正文 HTML 在后
  function buildExportText() {
    const cleaned = sanitizeForExport(previewArea.innerHTML);
    const bodyHtml = Array.from(cleaned.children)
      .map(el => el.outerHTML)
      .join('\n');

    return buildCssCommentBlock() + '\n\n' + bodyHtml + '\n';
  }

  // ---------- 下载 ----------
  downloadBtn.addEventListener('click', () => {
    const text = buildExportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ao3-formatted.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('已下载 ao3-formatted.txt');
  });

  // ---------- 复制到剪贴板 ----------
  copyBtn.addEventListener('click', () => {
    const text = buildExportText();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => setStatus('已复制到剪贴板'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  });

  // 旧浏览器兜底的复制方式
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      setStatus('已复制到剪贴板');
    } catch (err) {
      setStatus('复制失败，请手动选中文字复制');
    }
    document.body.removeChild(ta);
  }

})();
