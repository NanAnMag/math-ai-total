var app = getApp();

var SUPERVISE_PROMPT = '【督学提醒智能体】\n扮演高数学习督学角色，生成学习提醒、复盘内容、学习周报、考前提醒。\n根据用户学习数据、未完成任务、薄弱知识点生成内容。\n输出分类：\n1. 今日待办提醒：未完成学习任务、刷题任务、复盘任务\n2. 知识点复盘提醒：针对高频错题、薄弱知识点进行复习提醒\n3. 学习周报总结：本周学习时长、做题情况、知识点掌握变化、进步与不足\n4. 考前冲刺提醒：考前复习重点、必背公式、高频题型、临场注意事项\n语言风格简洁直白、提醒清晰，贴合学生学习场景。';

var PATH_PROMPT = '【学习路径规划】\n根据学生现有知识掌握情况、薄弱点，规划从基础到进阶的完整高数学习路线。\n输出结构：\n1. 现状评估：当前知识掌握情况、短板模块\n2. 学习阶段划分：第一阶段（基础补漏）、第二阶段（强化训练）、第三阶段（进阶/考研）\n3. 每阶段学习顺序：按先后顺序列出需要学习的知识点、先后逻辑\n4. 阶段目标：每个阶段需要达成的掌握程度\n5. 跳过说明：明确标注学生已完全掌握、可以直接跳过的章节';

var DASHBOARD_PROMPT = '【学习数据分析&数据看板报告】\n根据用户提供的全量学习数据，生成完整高数学习数据报告。\n输出结构严格按以下模块划分，模块之间空一行：\n一、整体学习概况\n统计累计学习时长、总刷题数量、整体答题正确率，总结整体学习状态。\n二、知识点掌握情况\n逐一说明各章节知识点掌握水平，明确标注优势模块、薄弱模块。\n三、错题&易错题型分析\n汇总高频错题类型、集中出错的知识点，分析共性问题。\n四、学习趋势与评价\n分析近期学习进步点、现存问题，给出客观综合评价。\n五、针对性优化建议\n结合数据给出后续学习、刷题、复盘的可落地建议。';

Page({
  data: {
    scrollTo: '',
    superviseLoading: false, superviseContent: '', superviseNodes: [],
    masteredKnow: '', pathGoalIndex: 0, pathGoalList: ['基础巩固', '期末备考', '考研备考'],
    pathLoading: false, pathContent: '', pathNodes: [],
    dashboardLoading: false, dashboardContent: '', dashboardNodes: [],
    dashStats: { errorCount: 0, weakPoint: '--', levelText: '--', masteryPercent: 0 },
    dashChartData: [],
    userHabit: '', habitSaved: false,
    toolCollapsed: {},
    sortedTools: [],
    favorites: [],
  },

  onShow() {
    // 需要覆盖 onLoad 中的 onShow？tools 页面用 onLoad
    var favs = wx.getStorageSync('favorites') || [];
    this.setData({ favorites: favs });
  },

  viewFavorite(e) {
    var idx = parseInt(e.currentTarget.dataset.index);
    var fav = this.data.favorites[idx];
    if (fav) {
      wx.setClipboardData({ data: fav.content, success: function () { wx.showToast({ title: '内容已复制', icon: 'success' }); } });
    }
  },

  clearFavorites() {
    var that = this;
    wx.showModal({
      title: '确认清空',
      content: '确定清空所有收藏吗？',
      success: function (res) {
        if (res.confirm) {
          wx.setStorageSync('favorites', []);
          that.setData({ favorites: [] });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  toggleTool(e) {
    var key = e.currentTarget.dataset.key;
    var tc = this.data.toolCollapsed || {};
    tc[key] = !tc[key];
    this.setData({ toolCollapsed: tc });
  },

  recordUsage(key) {
    var usage = wx.getStorageSync('tool_usage') || {};
    usage[key] = (usage[key] || 0) + 1;
    wx.setStorageSync('tool_usage', usage);
  },

  getSortedTools() {
    var usage = wx.getStorageSync('tool_usage') || {};
    var tools = [
      { key: 'supervise', name: '督学提醒' },
      { key: 'path', name: '学习路径' },
      { key: 'dashboard', name: '数据看板' }
    ];
    tools.sort(function (a, b) { return (usage[b.key] || 0) - (usage[a.key] || 0); });
    return tools;
  },

  onLoad(options) {
    var section = options.section || '';
    if (section) { this.setData({ scrollTo: 'sec-' + section }); }
    var habit = wx.getStorageSync('user_habit') || '';
    if (habit) { this.setData({ userHabit: habit, habitSaved: true }); }
    var favs = wx.getStorageSync('favorites') || [];
    this.setData({ favorites: favs, sortedTools: this.getSortedTools() });
    // 自动生成
    var weak = wx.getStorageSync('weak_point');
    if (weak) {
      this.generateSupervise();
      this.generatePath();
      this.generateDashboard();
    }
  },

  parseLines(text) {
    if (!text) return [];
    return text.split('\n').map(function (line) {
      return { name: 'div', attrs: { style: 'line-height:1.8;font-size:28rpx;color:#333;margin-bottom:4rpx;' }, children: [{ type: 'text', text: line }] };
    });
  },

  callApi(prompt, key) {
    var that = this;
    var weak = wx.getStorageSync('weak_point') || '';
    var level = wx.getStorageSync('mastery_level') || '';
    var data = {};
    data[key + 'Loading'] = true;
    data[key + 'Content'] = '';
    data[key + 'Nodes'] = [];
    that.setData(data);

    app.request({
      url: '' + app.globalData.apiBase + '/api/generate',
      method: 'POST',
      data: 'weak=' + encodeURIComponent(weak) + '&level=' + encodeURIComponent(level) + '&prompt=' + encodeURIComponent(prompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 45000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.content;
          var result = {};
          result[key + 'Content'] = text;
          result[key + 'Nodes'] = app.smartParseLines(text);
          result[key + 'Loading'] = false;
          that.setData(result);
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' });
          var fail = {}; fail[key + 'Loading'] = false; that.setData(fail);
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常', icon: 'none' });
        var fail = {}; fail[key + 'Loading'] = false; that.setData(fail);
      }
    });
  },

  generateSupervise() {
    this.recordUsage('supervise');
    var weakPoint = wx.getStorageSync('weak_point') || '暂无记录';
    var studyData = '薄弱知识点：' + weakPoint + '\n近期学习：高数相关章节练习与错题分析\n做题数量：已完成若干练习题';
    var fullPrompt = SUPERVISE_PROMPT + '\n用户学习数据：' + studyData + '\n未完成任务：未完成错题复盘、未完成每日刷题任务、未整理错题本\n薄弱知识点：' + weakPoint;
    this.callApi(fullPrompt, 'supervise');
  },

  onMasteredInput(e) { this.setData({ masteredKnow: e.detail.value }); },
  onPathGoalChange(e) { this.setData({ pathGoalIndex: parseInt(e.detail.value) }); },
  generatePath() {
    this.recordUsage('path');
    var weakKnow = wx.getStorageSync('weak_point') || '未诊断';
    var mastered = (this.data.masteredKnow || '').trim() || '基础函数、初等数学';
    var goal = this.data.pathGoalList[this.data.pathGoalIndex];
    var fullPrompt = PATH_PROMPT + '\n学生已掌握知识点：' + mastered + '\n学生薄弱知识点：' + weakKnow + '\n学习目标：' + goal;
    this.callApi(fullPrompt, 'path');
  },

  generateDashboard() {
    this.recordUsage('dashboard');
    var that = this;
    var weakPoint = wx.getStorageSync('weak_point') || '未诊断';
    var level = wx.getStorageSync('mastery_level') || '未知';
    var errorList = wx.getStorageSync('error_list') || [];
    var masteryMap = { '入门': 30, '中等': 60, '较好': 85 };
    // 尝试从后端获取真实学习数据
    app.request({
      url: '' + app.globalData.apiBase + '/api/progress', method: 'POST',
      data: 'user_id=' + encodeURIComponent(app.getUserId()),
      header: { 'content-type': 'application/x-www-form-urlencoded' }, timeout: 10000,
      success: function (res) {
        var d = (res.data && res.data.code === 200) ? res.data.data : null;
        var total = d ? d.total_questions : errorList.length;
        var acc = d ? d.accuracy : 0;
        that.setData({
          dashStats: { errorCount: total, weakPoint: weakPoint.length > 8 ? weakPoint.substring(0, 8) + '...' : (weakPoint || '未诊断'), levelText: level || '未知', masteryPercent: masteryMap[level] || Math.max(30, acc || 50) },
          dashChartData: (d && d.daily) ? d.daily.slice(0, 5).map(function (x) { return { name: x.date.substring(5), pct: Math.min(100, x.questions * 20) }; }) : [{ name: '极限', pct: 60 }, { name: '导数', pct: 50 }, { name: '积分', pct: 45 }]
        });
        that.callApi(DASHBOARD_PROMPT + '\n用户学习数据：薄弱知识点：' + weakPoint + '\n掌握水平：' + level + '\n累计做题：' + total + '道\n正确率：' + acc + '%', 'dashboard');
      },
      fail: function () {
        that.setData({ dashStats: { errorCount: errorList.length, weakPoint: weakPoint.length > 8 ? weakPoint.substring(0, 8) + '...' : (weakPoint || '未诊断'), levelText: level || '未知', masteryPercent: masteryMap[level] || 50 }, dashChartData: [{ name: '极限', pct: 60 }, { name: '导数', pct: 50 }, { name: '积分', pct: 45 }] });
        that.callApi(DASHBOARD_PROMPT + '\n用户学习数据：薄弱知识点：' + weakPoint + '\n掌握水平：' + level + '\n累计错题数：' + errorList.length + '道', 'dashboard');
      }
    });
  },

  onHabitInput(e) { this.setData({ userHabit: e.detail.value, habitSaved: false }); },
  saveHabit() {
    var habit = (this.data.userHabit || '').trim();
    wx.setStorageSync('user_habit', habit);
    app.globalData.userHabit = habit;
    app.syncSave();
    this.setData({ habitSaved: true });
    wx.showToast({ title: '偏好已保存', icon: 'success' });
  }
});
