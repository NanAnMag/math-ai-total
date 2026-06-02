var app = getApp();

var DIAGNOSIS_PROMPT = '【学情诊断智能体】\n' +
  '结合用户提供的错题、作答内容，完成专业学情诊断。\n' +
  '输出严格使用标准JSON格式，无任何多余文字、解释、说明。\n' +
  'JSON固定字段：\n' +
  '{\n' +
  '  "weak_knowledge": "精准定位薄弱知识点，如：一元函数积分、复合函数求导、极限求解",\n' +
  '  "error_type": "详细分析错误类型：概念理解错误/计算失误/解题思路偏差/公式误用",\n' +
  '  "error_reason": "深度剖析出错原因、思维误区、知识点漏洞，讲清学生哪里理解不到位",\n' +
  '  "mastery_level": "仅填写：入门 / 中等 / 较好",\n' +
  '  "easy_mistake_points": "列举该知识点高频易错点",\n' +
  '  "study_suggest": "给出可落地、具体化的提升学习建议"\n' +
  '}';

var GRADE_PROMPT = '【作业批改智能体】\n' +
  '对学生高数解题过程进行全自动批改、纠错、点评。\n' +
  '输出结构要求：\n' +
  '1. 批改总评：整体作答情况、得分情况、整体评价\n' +
  '2. 逐步骤批改：逐行检查解题步骤，标注【正确】/【错误】，定位错误步骤\n' +
  '3. 错误分析：说明错误原因、公式误用、计算错误、逻辑错误等问题\n' +
  '4. 标准完整解法：给出完整、规范、分步标准解题过程\n' +
  '5. 扣分点说明：明确失分位置与失分原因\n' +
  '6. 修正建议：指导学生如何规避同类错误、巩固对应知识点';

var NOTEBOOK_PROMPT = '【智能错题本生成】\n对收集到的高数错题进行整理、归类、强化训练。\n输出结构：\n1. 错题归类：按知识点、错误类型统一分类整理\n2. 原题+错误作答：展示错题与学生原有错误思路\n3. 标准解析：完整分步解答+错误根源分析\n4. 同类变式练习题：生成2~3道同考点变式题，用于巩固复盘\n5. 复习建议：该类错题的复习节奏、刷题重点';

var GRAPH_PROMPT = '【高数知识图谱解读&关联学习推荐】\n' +
  '结合高数完整知识体系，解读当前薄弱知识点在整个知识框架中的位置、前置知识点、关联知识点、后续延伸知识点。\n' +
  '输出结构：\n' +
  '一、当前知识点定位\n' +
  '说明该知识点所属大章节、核心作用、学习地位。\n' +
  '二、前置必备知识点\n' +
  '学习本内容必须先掌握的基础知识点，若存在漏洞建议优先补学。\n' +
  '三、同级关联知识点\n' +
  '容易混淆、搭配考察的同类知识点，一并说明区别与联系。\n' +
  '四、后续延伸知识点\n' +
  '以此为基础拓展的进阶内容、常结合出题的模块。\n' +
  '五、图谱联动学习建议\n' +
  '按照知识关联顺序，给出最优学习、刷题、复盘顺序。';

Page({
  data: {
    activeTab: 0,
    // 学情诊断
    wrongContent: '',
    loading: false,
    result: null,
    // 作业批改
    gradeImage: '',
    gradeQuestion: '',
    gradeAnswer: '',
    gradeLoading: false,
    gradeResult: '',
    gradeNodes: [],
    // 智能错题本
    errorList: [], filteredErrorList: [], errorKpList: [], errorFilterKp: '',
    manualErrorInput: '', notebookLoading: false, notebookResult: '', notebookNodes: [],
    // 协同工作流结果
    workflowResult: null,
    // 知识图谱
    graphPoint: '',
    graphInput: '',
    graphLoading: false,
    graphContent: '',
    graphNodes: []
  },

  // ==================== 通用 ====================
  onShow() {
    var errorList = wx.getStorageSync('error_list') || [];
    var weakPoint = wx.getStorageSync('weak_point') || '';
    var kpHistory = wx.getStorageSync('kp_history') || [];
    if (weakPoint && kpHistory.indexOf(weakPoint) === -1) kpHistory.unshift(weakPoint);
    this.setData({
      errorList: errorList, filteredErrorList: errorList,
      errorKpList: kpHistory.slice(0, 8), errorFilterKp: '',
      graphPoint: weakPoint
    });
  },

  switchTab(e) {
    this.setData({ activeTab: parseInt(e.currentTarget.dataset.index) });
    if (parseInt(e.currentTarget.dataset.index) === 2) {
      var errorList = wx.getStorageSync('error_list') || [];
      this.setData({ errorList: errorList, filteredErrorList: errorList, errorFilterKp: '' });
    }
  },

  parseLines(text) {
    if (!text) return [];
    return text.split('\n').map(function (line) {
      return {
        name: 'div',
        attrs: { style: 'line-height:1.8;font-size:28rpx;color:#333;margin-bottom:4rpx;' },
        children: [{ type: 'text', text: line }]
      };
    });
  },

  // ==================== 学情诊断 ====================
  onInputChange(e) {
    var raw = e.detail.value;
    this.setData({ wrongContent: this.convertLatexToUnicode(raw) });
  },

  convertLatexToUnicode(text) {
    if (!text) return '';
    var result = text;

    // ── 第0步：清洗从豆包等AI平台粘贴来的任何非纯文本 ──
    // 去除HTML标签（豆包可能嵌在<span>、<math>等标签里）
    result = result.replace(/<[^>]+>/g, '');
    // 解码HTML实体
    result = result.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    result = result.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ');

    // ── 第1步：去掉数学分隔符 ──
    result = result.replace(/\\\[\s*/g, '').replace(/\s*\\\]/g, '');
    result = result.replace(/\\\(\s*/g, '').replace(/\s*\\\)/g, '');
    result = result.replace(/\$\$\s*/g, '').replace(/\s*\$\$/g, '');
    result = result.replace(/\$\s*/g, '').replace(/\s*\$/g, '');
    result = result.replace(/\\begin\{[^}]*\}\s*/g, '').replace(/\s*\\end\{[^}]*\}/g, '');
    result = result.replace(/\\displaystyle\s*/g, '');
    result = result.replace(/\\text\{([^}]*)\}/g, '$1');
    result = result.replace(/\\mathrm\{([^}]*)\}/g, '$1');
    result = result.replace(/\\mathbf\{([^}]*)\}/g, '$1');
    result = result.replace(/\\mathit\{([^}]*)\}/g, '$1');
    result = result.replace(/\\left\s*/g, '').replace(/\s*\\right/g, '');
    result = result.replace(/\\big[gl]?\s*/g, '').replace(/\\bigg[gl]?\s*/g, '');
    result = result.replace(/\\limits\s*/g, '');
    result = result.replace(/\\nolimits\s*/g, '');
    result = result.replace(/\\qquad\s*/g, '  ').replace(/\\quad\s*/g, ' ');
    result = result.replace(/\\,/g, ' ').replace(/\\;/g, ' ');
    result = result.replace(/\\space\s*/g, ' ');
    result = result.replace(/\\boxed\{([^}]*)\}/g, '$1');
    result = result.replace(/\\not\s*/g, '¬');

    result = result.replace(/\\dfrac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '($1)/($2)');
    result = result.replace(/\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '($1)/($2)');
    result = result.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
    result = result.replace(/\^\{([^}]+)\}/g, function (_, p) { return this.toSuperscript(p); }.bind(this));
    result = result.replace(/_\{([^}]+)\}/g, function (_, p) { return this.toSubscript(p); }.bind(this));
    result = result.replace(/\^(\d)/g, function (_, d) { return this.toSuperscript(d); }.bind(this));
    result = result.replace(/_(\d)/g, function (_, d) { return this.toSubscript(d); }.bind(this));
    var greek = { '\\alpha':'α','\\beta':'β','\\gamma':'γ','\\Gamma':'Γ','\\delta':'δ','\\Delta':'Δ','\\epsilon':'ε','\\theta':'θ','\\Theta':'Θ','\\lambda':'λ','\\Lambda':'Λ','\\mu':'μ','\\pi':'π','\\Pi':'Π','\\sigma':'σ','\\Sigma':'Σ','\\tau':'τ','\\phi':'φ','\\Phi':'Φ','\\psi':'ψ','\\Psi':'Ψ','\\omega':'ω','\\Omega':'Ω','\\xi':'ξ','\\eta':'η','\\rho':'ρ','\\zeta':'ζ' };
    for (var k in greek) result = result.split(k).join(greek[k]);
    var sym = { '\\partial':'∂','\\int':'∫','\\iint':'∬','\\oint':'∮','\\sum':'∑','\\prod':'∏','\\infty':'∞','\\pm':'±','\\cdot':'·','\\times':'×','\\div':'÷','\\leq':'≤','\\geq':'≥','\\neq':'≠','\\approx':'≈','\\equiv':'≡','\\to':'→','\\rightarrow':'→','\\Rightarrow':'⇒','\\leftarrow':'←','\\forall':'∀','\\exists':'∃','\\emptyset':'∅','\\in':'∈','\\notin':'∉','\\subset':'⊂','\\subseteq':'⊆','\\cap':'∩','\\cup':'∪','\\angle':'∠','\\nabla':'∇','\\cdots':'⋯','\\vdots':'⋮','\\ddots':'⋱','\\parallel':'∥','\\perp':'⊥','\\circ':'∘' };
    for (var s in sym) result = result.split(s).join(sym[s]);
    return result;
  },

  toSuperscript(s) {
    var m = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','n':'ⁿ','i':'ⁱ' };
    return s.split('').map(function (c) { return m[c] || c; }).join('');
  },

  toSubscript(s) {
    var m = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋' };
    return s.split('').map(function (c) { return m[c] || c; }).join('');
  },

  submitAnalysis() {
    var content = (this.data.wrongContent || '').trim();
    if (!content) { wx.showToast({ title: '请输入错题内容', icon: 'none' }); return; }
    this.setData({ loading: true, result: null, notebookResult: '', notebookNodes: [], graphContent: '', graphNodes: [], workflowResult: null });

    var that = this;
    // 调用多智能体协同工作流
    app.request({
      url: '' + app.globalData.apiBase + '/api/workflow', method: 'POST',
      data: 'wrong_content=' + encodeURIComponent(content) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 90000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var d = res.data.data;
          var diag = d.diagnosis;
          var level = diag.mastery_level === '入门' ? 30 : (diag.mastery_level === '中等' ? 60 : 85);
          // 学情诊断结果
          that.setData({
            result: {
              weakPoints: [diag.weak_knowledge],
              errorType: diag.error_type || '',
              errorReason: diag.error_reason || '',
              masteryLevel: level,
              masteryLevelText: diag.mastery_level || '',
              easyMistakePoints: diag.easy_mistake_points || '',
              suggestion: diag.study_suggest || diag.suggest || ''
            },
            // 错题本结果
            notebookResult: d.notebook || '',
            notebookNodes: app.smartParseLines(d.notebook || ''),
            // 知识图谱结果
            graphContent: d.graph || '',
            graphNodes: app.smartParseLines(d.graph || ''),
            // 习题结果
            workflowResult: { exercises: d.exercises || '', exerciseNodes: app.smartParseLines(d.exercises || '') },
            loading: false
          });
          wx.setStorageSync('weak_point', diag.weak_knowledge);
          wx.setStorageSync('mastery_level', diag.mastery_level);
          // 同步到学习资源
          wx.setStorageSync('synced_exercises', d.exercises || '');
          wx.setStorageSync('synced_graph', d.graph || '');
          wx.setStorageSync('synced_notebook', d.notebook || '');
          // 用后端返回的最新同步数据直接更新本地
          if (d.sync) {
            var s = d.sync;
            if (s.weak_point) wx.setStorageSync('weak_point', s.weak_point);
            if (s.mastery_level) wx.setStorageSync('mastery_level', s.mastery_level);
            if (s.error_list) wx.setStorageSync('error_list', s.error_list);
          }
          app.syncSave();
          var errorList = wx.getStorageSync('error_list') || [];
          errorList.push(content);
          if (errorList.length > 20) errorList = errorList.slice(-20);
          wx.setStorageSync('error_list', errorList);
          that.setData({ errorList: errorList, filteredErrorList: errorList });
        } else {
          wx.showToast({ title: '分析失败', icon: 'none' });
          that.setData({ loading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ loading: false });
      }
    });
  },

  resetForm() {
    this.setData({ wrongContent: '', result: null, loading: false });
  },

  goToExercise() {
    wx.switchTab({ url: '/pages/resource/resource' });
  },

  // ==================== 智能错题本 ====================
  filterErrorByKp(e) {
    var kp = e.currentTarget.dataset.kp || '';
    var list = this.data.errorList;
    this.setData({ errorFilterKp: kp, filteredErrorList: kp ? list.filter(function (i) { return i.indexOf(kp) !== -1; }) : list });
  },
  onManualErrorInput(e) { this.setData({ manualErrorInput: e.detail.value }); },
  generateNotebook() {
    var that = this;
    var list = that.data.errorList || [];
    var manual = (that.data.manualErrorInput || '').trim();
    var coll = '';
    if (list.length > 0) { coll = '已收集错题：\n'; list.forEach(function (item, i) { coll += (i + 1) + '. ' + item + '\n'; }); }
    if (manual) { coll += '\n手动输入：\n' + manual; }
    if (!coll) { wx.showToast({ title: '暂无错题', icon: 'none' }); return; }
    that.setData({ notebookLoading: true, notebookResult: '', notebookNodes: [] });
    app.request({
      url: '' + app.globalData.apiBase + '/api/generate', method: 'POST',
      data: 'weak=' + encodeURIComponent(wx.getStorageSync('weak_point') || '') + '&prompt=' + encodeURIComponent(NOTEBOOK_PROMPT + '\n错题集合：' + coll) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' }, timeout: 60000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var t = res.data.content;
          that.setData({ notebookResult: t, notebookNodes: app.smartParseLines(t), notebookLoading: false });
        } else { wx.showToast({ title: '生成失败', icon: 'none' }); that.setData({ notebookLoading: false }); }
      },
      fail: function () { wx.showToast({ title: '网络异常', icon: 'none' }); that.setData({ notebookLoading: false }); }
    });
  },

  // ==================== 知识图谱 ====================
  onGraphInput(e) {
    this.setData({ graphInput: e.detail.value });
  },

  generateGraph() {
    var that = this;
    var point = (that.data.graphInput || '').trim() || that.data.graphPoint;
    if (!point) { wx.showToast({ title: '请先完成学情诊断', icon: 'none' }); return; }

    var fullPrompt = GRAPH_PROMPT + '\n当前薄弱知识点：' + point;
    that.setData({ graphLoading: true, graphContent: '', graphNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(point) + '&level=' + encodeURIComponent(wx.getStorageSync('mastery_level') || '') + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 45000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({ graphContent: text, graphNodes: app.smartParseLines(text), graphLoading: false });
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' });
          that.setData({ graphLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ graphLoading: false });
      }
    });
  },

  // ==================== 智能错题本 ====================
  // ==================== 作业批改 ====================
  onGradeQuestionInput(e) {
    this.setData({ gradeQuestion: e.detail.value });
  },

  onGradeAnswerInput(e) {
    this.setData({ gradeAnswer: e.detail.value });
  },

  chooseImage() {
    var that = this;
    wx.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['camera', 'album'],
      success: function (res) { that.setData({ gradeImage: res.tempFilePaths[0] }); }
    });
  },

  submitGrade() {
    var that = this;
    var image = that.data.gradeImage;
    if (!image) { wx.showToast({ title: '请先拍照', icon: 'none' }); return; }

    that.setData({ gradeLoading: true, gradeResult: '', gradeNodes: [] });

    wx.uploadFile({
      url: app.globalData.apiBase + '/api/grade-image', filePath: image, name: 'file',
      formData: { question: '', prompt: '请先判断图片内容：如果图片中只有题目没有作答，则给出完整解题步骤和答案；如果图片中包含学生作答，则批改作业（总评+逐步骤检查+错误分析+正确解法）。', rules: app.getFullRules() },
      timeout: 120000,
      success: function (res) {
        try {
          var data = JSON.parse(res.data);
          if (data && data.code === 200) {
            that.setData({ gradeResult: data.content, gradeNodes: app.smartParseLines(data.content), gradeLoading: false });
          } else { wx.showToast({ title: '批改失败', icon: 'none' }); that.setData({ gradeLoading: false }); }
        } catch (e) { wx.showToast({ title: '数据异常', icon: 'none' }); that.setData({ gradeLoading: false }); }
      },
      fail: function () { wx.showToast({ title: '网络异常', icon: 'none' }); that.setData({ gradeLoading: false }); }
    });
  },
});
