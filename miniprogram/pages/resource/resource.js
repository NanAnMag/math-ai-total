var app = getApp();

var EXERCISE_PROMPT = '【习题生成智能体】\n' +
  '根据用户薄弱知识点、掌握水平，分层生成高数习题，实现个性化精准刷题，拒绝题海战术。\n' +
  '输出固定结构：\n' +
  '一、基础巩固题（1~2道）：面向入门水平，侧重公式、概念、基础计算\n' +
  '二、能力拔高题（2道）：面向中等水平，侧重综合运用、变式题型\n' +
  '三、考研变式题（1道）：面向提升阶段，贴合考研高数出题风格\n' +
  '每道题目格式：\n' +
  '【题目】完整高数题目（正常使用数学符号与公式）\n' +
  '【解题步骤】分步详细解答，第一步、第二步依次书写，附带思路说明\n' +
  '【答案】最终结果\n' +
  '要求：题目难度逐级递增，完全围绕指定薄弱知识点出题，题型经典、不偏题、不怪题。';

var NOTES_PROMPT = '【个性化讲义生成】\n' +
  '针对用户指定薄弱知识点，生成专属精简高数学习讲义、个人笔记。\n' +
  '输出结构：\n' +
  '1. 核心知识点梳理：概念、定义、核心定理，语言通俗化讲解\n' +
  '2. 必背公式汇总：整理本章节全部常用公式，附带使用条件\n' +
  '3. 解题套路总结：归纳本知识点通用解题方法、步骤模板\n' +
  '4. 典型例题精讲：2~3道经典例题，分步讲解+思路分析\n' +
  '5. 学习注意事项：概念误区、公式使用禁忌、计算易错点\n' +
  '讲义精简实用、针对性强，剔除学生已掌握内容，只聚焦薄弱模块。';

var CONFUSE_PROMPT = '【易混知识点辨析】\n' +
  '对两组高度相似、学生极易混淆的高数知识点进行对比讲解。\n' +
  '输出结构：\n' +
  '1. 各自概念讲解：分别通俗解释两个知识点\n' +
  '2. 核心区别对比：从定义、条件、用法、场景多维度区分\n' +
  '3. 对比表格梳理：清晰罗列差异点\n' +
  '4. 区分例题：各配一道例题，直观展示使用场景不同\n' +
  '5. 记忆技巧：简单方法帮助区分记忆';

var TEMPLATE_PROMPT = '【解题模板总结】\n' +
  '针对指定高数经典题型，总结通用标准化解题模板。\n' +
  '输出结构：\n' +
  '1. 题型识别：如何判断属于该类题型\n' +
  '2. 通用解题模板：固定解题步骤、流程框架\n' +
  '3. 模板套用例题：结合例题演示如何一步步套用模板解题\n' +
  '4. 模板变形提醒：题型变化后模板如何灵活调整\n' +
  '5. 避坑指南：使用模板时高频错误';

var EXAM_PROMPT = '【考前冲刺卷生成】\n' +
  '根据学生当前水平、考察范围，定制高数期中/期末/考研模拟冲刺试卷。\n' +
  '试卷结构：选择题、填空题、解答题，题型、分值贴合高校高数考试标准。\n' +
  '输出分为两大部分：\n' +
  '第一部分：完整冲刺试卷（题目+分值）\n' +
  '第二部分：试卷参考答案+逐题详细解析、解题步骤、考点说明\n' +
  '难度匹配学生实际水平，重点侧重学生薄弱知识点，兼顾高频考点。';

var CHAPTER_PROMPT = '【章节专项训练包】\n' +
  '围绕指定高数章节/知识点，生成全套专项训练题库，分为基础、提升两个模块。\n' +
  '内容包含：知识点小总结 + 专项练习题（带解析答案）。\n' +
  '题目数量：基础题3道，提升题3道，全部附带详细解题步骤。\n' +
  '要求：题型覆盖全面、难度梯度合理，适合集中专项突破薄弱点。';

var STUDY_PLAN_PROMPT = '【学习规划智能体】\n' +
  '结合用户薄弱知识点、当前掌握水平、学习目标、可用学习时长，生成完整个性化高数学习方案。\n' +
  '输出结构要求：\n' +
  '1. 整体学情总结：概括当前知识漏洞与学习现状\n' +
  '2. 阶段性学习目标：区分基础巩固/强化提升/考前冲刺/考研备考\n' +
  '3. 周学习计划：按天划分每日学习任务、学习内容、建议时长\n' +
  '4. 每日任务清单：知识点学习、例题练习、刷题任务、复盘任务逐一列出\n' +
  '5. 进度调整说明：说明如何根据做题正确率动态调整后续学习难度与进度\n' +
  '6. 复盘要求：明确每日/每周知识点复盘重点\n' +
  '要求：计划贴合学生实际，任务量合理、循序渐进，针对性补齐薄弱点。';

Page({
  data: {
    activeTab: 0,
    knowledgePoints: [],
    selectedKp: '',
    customKp: '',
    collapsed: {},
    showMoreTools: false,
    contentSummary: [],
    contentStats: { chars: 0, readTime: 0, lines: 0 },
    exerciseStats: { chars: 0, readTime: 0 },
    planSummary: [],
    planStats: { chars: 0, readTime: 0, lines: 0 },
    loading: false,
    resourceContent: '',
    contentNodes: [],
    exerciseLoading: false,
    exerciseContent: '',
    exerciseNodes: [],
    notesLoading: false,
    notesContent: '',
    notesNodes: [],
    chapterInput: '',
    chapterLoading: false,
    chapterContent: '',
    chapterNodes: [],
    examTypeIndex: 0,
    examTypeList: ['期末考试', '期中考试', '考研模拟'],
    examRange: '',
    examLoading: false,
    examContent: '',
    examNodes: [],
    templateInput: '',
    templateLoading: false,
    templateContent: '',
    templateNodes: [],
    confuseInput: '',
    confuseLoading: false,
    confuseContent: '',
    confuseNodes: [],
    planSelectedKp: '',
    planCustomKp: '',
    planLoading: false,
    planContent: '',
    planNodes: [],
    weakPoint: '',
    level: '',
    targetIndex: 0,
    targetList: ['考研备考', '期末冲刺', '日常巩固', '基础补漏'],
    studyTime: '2'
  },

  switchTab(e) {
    var idx = parseInt(e.currentTarget.dataset.index);
    this.setData({ activeTab: idx });
  },

  copyContent(e) {
    var content = e.currentTarget.dataset.content || '';
    if (!content) { wx.showToast({ title: '暂无内容', icon: 'none' }); return; }
    wx.setClipboardData({ data: content, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  },

  saveFavorite(e) {
    var title = e.currentTarget.dataset.title || '未命名';
    var content = e.currentTarget.dataset.content || '';
    if (!content) { wx.showToast({ title: '暂无内容可收藏', icon: 'none' }); return; }
    var favs = wx.getStorageSync('favorites') || [];
    favs.unshift({ title: title, content: content, time: new Date().toLocaleString() });
    if (favs.length > 50) favs = favs.slice(0, 50);
    wx.setStorageSync('favorites', favs);
    app.syncSave();
    wx.showToast({ title: '已收藏', icon: 'success' });
  },

  toggleMoreTools() {
    this.setData({ showMoreTools: !this.data.showMoreTools });
  },

  toggleSection(e) {
    var key = e.currentTarget.dataset.key;
    var collapsed = this.data.collapsed || {};
    collapsed[key] = !collapsed[key];
    this.setData({ collapsed: collapsed });
  },

  computeStats(text) {
    if (!text) return { chars: 0, readTime: 0, lines: 0 };
    var chars = text.length;
    var lines = text.split('\n').filter(function (l) { return l.trim(); }).length;
    var readTime = Math.max(1, Math.ceil(chars / 500));
    return { chars: chars, readTime: readTime, lines: lines };
  },

  onTargetChange(e) {
    this.setData({ targetIndex: parseInt(e.detail.value) });
  },

  onTimeInput(e) {
    this.setData({ studyTime: e.detail.value });
  },

  parseContent(text) {
    if (!text) return [];
    return text.split('\n').map(function (line) {
      return {
        name: 'div',
        attrs: { style: 'line-height:1.8;font-size:28rpx;color:#333;margin-bottom:4rpx;' },
        children: [{ type: 'text', text: line }]
      };
    });
  },

  onShow() {
    var that = this;
    var weak = wx.getStorageSync('weak_point') || '';
    var level = wx.getStorageSync('mastery_level') || '';

    var openTab = wx.getStorageSync('open_tab');
    if (openTab !== undefined && openTab !== '') {
      this.setData({ activeTab: parseInt(openTab) });
      wx.removeStorageSync('open_tab');
    }

    that.setData({ weakPoint: weak, level: level });

    // 检查是否有从诊断协同过来的内容
    var syncedExercises = wx.getStorageSync('synced_exercises') || '';
    if (syncedExercises && that.data.activeTab === 0 && !that.data.resourceContent) {
      that.setData({
        resourceContent: syncedExercises,
        contentNodes: app.smartParseLines(syncedExercises),
        contentStats: that.computeStats(syncedExercises),
        contentSummary: app.extractSummary(syncedExercises)
      });
    }

    // 从错题记录中提取知识点列表
    var errorList = wx.getStorageSync('error_list') || [];
    var kpSet = {};
    if (weak) kpSet[weak] = true;
    errorList.forEach(function (item) {
      if (item && item.length > 2) {
        var short = item.substring(0, 12).replace(/[，。！？\n]/g, '');
        kpSet[short] = true;
      }
    });
    var kpList = Object.keys(kpSet).slice(0, 8);
    var storedKps = wx.getStorageSync('kp_history') || [];
    storedKps.forEach(function (k) { if (k && kpList.indexOf(k) === -1) kpList.push(k); });

    that.setData({ knowledgePoints: kpList.slice(0, 10), selectedKp: kpList[0] || '', planSelectedKp: kpList[0] || '' });
  },

  selectKp(e) {
    var kp = e.currentTarget.dataset.kp;
    this.setData({ selectedKp: kp, customKp: '' });
  },

  onCustomKpInput(e) {
    this.setData({ customKp: e.detail.value, selectedKp: '' });
  },

  startGenerate() {
    var that = this;
    var kp = that.data.selectedKp || that.data.customKp || '';
    if (!kp.trim()) { wx.showToast({ title: '请选择或输入知识点', icon: 'none' }); return; }

    // 保存到知识点历史
    var storedKps = wx.getStorageSync('kp_history') || [];
    if (storedKps.indexOf(kp) === -1) {
      storedKps.unshift(kp);
      if (storedKps.length > 20) storedKps = storedKps.slice(0, 20);
      wx.setStorageSync('kp_history', storedKps);
    }
    app.syncSave();
    that.setData({ weakPoint: kp });
    that.getResource(kp, that.data.level);
  },

  // Tab 0：知识点总结 + 配套习题
  getResource(weak, level) {
    var that = this;
    that.setData({ loading: true, resourceContent: '', contentNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(level) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
      success: function (res) {
        console.log('资源接口返回：', res.data);
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({
            resourceContent: text,
            contentNodes: app.smartParseLines(text),
            contentStats: that.computeStats(text),
            contentSummary: app.extractSummary(text),
            loading: false
          });
        } else {
          wx.showToast({ title: '生成资源失败', icon: 'none' });
          that.setData({ loading: false });
        }
      },
      fail: function (err) {
        console.error('请求失败：', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ loading: false });
      }
    });
  },

  // 分层习题生成（在 Tab 0 学习资源下）
  generateExercise() {
    var that = this;
    var weak = that.data.weakPoint;
    var level = that.data.level;

    var fullPrompt = EXERCISE_PROMPT + '\n' +
      '用户信息：\n' +
      '薄弱知识点：' + weak + '\n' +
      '掌握水平：' + level;

    that.setData({ exerciseLoading: true, exerciseContent: '', exerciseNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
      success: function (res) {
        console.log('习题接口返回：', res.data);
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({
            exerciseContent: text,
            exerciseNodes: app.smartParseLines(text),
            exerciseStats: that.computeStats(text),
            exerciseLoading: false
          });
        } else {
          wx.showToast({ title: '生成习题失败', icon: 'none' });
          that.setData({ exerciseLoading: false });
        }
      },
      fail: function (err) {
        console.error('请求失败：', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ exerciseLoading: false });
      }
    });
  },

  // 个性化讲义生成（在 Tab 0 学习资源下）
  generateNotes() {
    var that = this;
    var weak = that.data.weakPoint;
    var level = that.data.level;

    var fullPrompt = NOTES_PROMPT + '\n' +
      '目标知识点：' + weak + '\n' +
      '学生水平：' + level;

    that.setData({ notesLoading: true, notesContent: '', notesNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({
            notesContent: text,
            notesNodes: app.smartParseLines(text),
            notesLoading: false
          });
        } else {
          wx.showToast({ title: '生成讲义失败', icon: 'none' });
          that.setData({ notesLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常，请检查连接', icon: 'none' });
        that.setData({ notesLoading: false });
      }
    });
  },

  // 章节专项训练（在 Tab 0 学习资源下）
  onChapterInput(e) {
    this.setData({ chapterInput: e.detail.value });
  },

  generateChapter() {
    var that = this;
    var chapter = (that.data.chapterInput || '').trim() || that.data.weakPoint;
    var level = that.data.level;

    var fullPrompt = CHAPTER_PROMPT + '\n' +
      '训练章节/知识点：' + chapter + '\n' +
      '学生水平：' + level;

    that.setData({ chapterLoading: true, chapterContent: '', chapterNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(chapter) + '&level=' + encodeURIComponent(level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({
            chapterContent: text,
            chapterNodes: app.smartParseLines(text),
            chapterLoading: false
          });
        } else {
          wx.showToast({ title: '生成训练包失败', icon: 'none' });
          that.setData({ chapterLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常，请检查连接', icon: 'none' });
        that.setData({ chapterLoading: false });
      }
    });
  },

  // 考前冲刺卷（在 Tab 0 学习资源下）
  onExamTypeChange(e) {
    this.setData({ examTypeIndex: parseInt(e.detail.value) });
  },

  onExamRangeInput(e) {
    this.setData({ examRange: e.detail.value });
  },

  generateExam() {
    var that = this;
    var weak = that.data.weakPoint;
    var level = that.data.level;
    var examType = that.data.examTypeList[that.data.examTypeIndex];
    var examRange = (that.data.examRange || '').trim() || '全部已学章节';

    var fullPrompt = EXAM_PROMPT + '\n' +
      '考察范围：' + examRange + '\n' +
      '考试类型：' + examType + '\n' +
      '学生水平：' + level + '\n' +
      '薄弱知识点（重点出题方向）：' + weak;

    that.setData({ examLoading: true, examContent: '', examNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 90000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({
            examContent: text,
            examNodes: app.smartParseLines(text),
            examLoading: false
          });
        } else {
          wx.showToast({ title: '生成试卷失败', icon: 'none' });
          that.setData({ examLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常，请检查连接', icon: 'none' });
        that.setData({ examLoading: false });
      }
    });
  },

  // 解题模板总结（在 Tab 0 学习资源下）
  onTemplateInput(e) {
    this.setData({ templateInput: e.detail.value });
  },

  generateTemplate() {
    var that = this;
    var questionType = (that.data.templateInput || '').trim();
    if (!questionType) {
      wx.showToast({ title: '请输入题型名称', icon: 'none' });
      return;
    }

    var fullPrompt = TEMPLATE_PROMPT + '\n目标题型：' + questionType;
    var weak = that.data.weakPoint;

    that.setData({ templateLoading: true, templateContent: '', templateNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(that.data.level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 45000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({ templateContent: text, templateNodes: app.smartParseLines(text), templateLoading: false });
        } else {
          wx.showToast({ title: '生成模板失败', icon: 'none' });
          that.setData({ templateLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常，请检查连接', icon: 'none' });
        that.setData({ templateLoading: false });
      }
    });
  },

  // 易混知识点辨析（在 Tab 0 学习资源下）
  onConfuseInput(e) {
    this.setData({ confuseInput: e.detail.value });
  },

  generateConfuse() {
    var that = this;
    var topic = (that.data.confuseInput || '').trim();
    if (!topic) { wx.showToast({ title: '请输入易混知识点', icon: 'none' }); return; }

    var fullPrompt = CONFUSE_PROMPT + '\n易混知识点：' + topic;

    that.setData({ confuseLoading: true, confuseContent: '', confuseNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(that.data.weakPoint) + '&level=' + encodeURIComponent(that.data.level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 45000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({ confuseContent: text, confuseNodes: app.smartParseLines(text), confuseLoading: false });
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' });
          that.setData({ confuseLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ confuseLoading: false });
      }
    });
  },

  selectPlanKp(e) {
    var kp = e.currentTarget.dataset.kp;
    this.setData({ planSelectedKp: kp, planCustomKp: '' });
  },

  onPlanCustomKpInput(e) {
    this.setData({ planCustomKp: e.detail.value, planSelectedKp: '' });
  },

  // Tab 1：个性化学习规划
  generatePlan() {
    var that = this;
    var weak = that.data.planSelectedKp || that.data.planCustomKp || that.data.weakPoint;
    if (!weak.trim()) { wx.showToast({ title: '请选择或输入知识点', icon: 'none' }); return; }
    var level = that.data.level;
    var target = that.data.targetList[that.data.targetIndex];
    var studyTime = that.data.studyTime || '2';

    var fullPrompt = STUDY_PLAN_PROMPT + '\n' +
      '用户信息：\n' +
      '薄弱知识点：' + weak + '\n' +
      '掌握水平：' + level + '\n' +
      '学习目标：' + target + '\n' +
      '每日可用学习时长：' + studyTime + '小时';

    that.setData({ planLoading: true, planContent: '', planNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(level) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
      success: function (res) {
        console.log('规划接口返回：', res.data);
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          that.setData({
            planContent: text,
            planNodes: app.smartParseLines(text),
            planStats: that.computeStats(text),
            planSummary: app.extractSummary(text),
            planLoading: false
          });
        } else {
          wx.showToast({ title: '生成规划失败', icon: 'none' });
          that.setData({ planLoading: false });
        }
      },
      fail: function (err) {
        console.error('请求失败：', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ planLoading: false });
      }
    });
  }
});
