// app.js
App({
  // 全局网络请求封装
  request: function (options) {
    var that = this;
    var originalFail = options.fail;
    options.fail = function (err) {
      console.error('网络请求失败:', options.url, err);
      if (!options.silent) {
        wx.showToast({ title: '网络异常，请检查后端服务', icon: 'none', duration: 2000 });
      }
      if (originalFail) originalFail(err);
    };
    options.timeout = options.timeout || 15000;
    wx.request(options);
  },

  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloudbase-d0gw696dxb5adb9a4',
        traceUser: true
      });
      this.globalData.cloudReady = true;
    }
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 自动判断API地址：devtools用127.0.0.1，真机用局域网IP
    var systemInfo = wx.getSystemInfoSync();
    var platform = systemInfo.platform || '';
    if (platform === 'devtools' || platform === 'mac' || platform === 'windows') {
      this.globalData.apiBase = 'http://127.0.0.1:8000';
    } else {
      this.globalData.apiBase = 'http://172.20.10.3:8000';
    }
    console.log('API地址:', this.globalData.apiBase, '平台:', platform);

    var userHabit = wx.getStorageSync('user_habit') || '';
    this.globalData.userHabit = userHabit;

    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },

  // AI 标记语法解析：**重点**=加粗蓝、!!警告!!=红底、==公式===蓝底、__标题__=大号加粗
  smartParseLines: function (text) {
    if (!text) return [];
    var lines = text.split('\n');
    var nodes = [];
    // 先处理跨行标记
    var combined = lines.join('\n');
    // 统一标记格式
    var markerRules = [
      { re: /\*\*(.+?)\*\*/g,            style: 'color:#1677ff;font-weight:700;' },
      { re: /!!(.+?)!!/g,                 style: 'color:#ff4d4f;font-weight:600;background:#fff2f0;border-radius:3rpx;padding:1rpx 4rpx;' },
      { re: /==(.+?)==/g,                 style: 'color:#1677ff;font-weight:600;background:#f0f5ff;border-radius:3rpx;padding:1rpx 4rpx;' },
      { re: /__(.+?)__/g,                 style: 'font-size:30rpx;font-weight:700;color:#333;' },
      { re: /--(.+?)--/g,                 style: 'color:#52c41a;font-weight:600;' }
    ];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) { nodes.push({ name: 'div', attrs: { style: 'height:8rpx;' }, children: [] }); continue; }

      // 检查是否整行是 __xxx__ 标题
      var titleMatch = line.match(/^__(.+)__$/);
      if (titleMatch) {
        nodes.push({ name: 'div', attrs: { style: 'line-height:1.8;font-size:30rpx;color:#333;font-weight:700;margin:16rpx 0 8rpx;' }, children: [{ type: 'text', text: titleMatch[1] }] });
        continue;
      }

      // 对普通行做标记解析
      var segments = [{ text: line }];
      for (var r = 0; r < markerRules.length; r++) {
        var rule = markerRules[r];
        var newSegs = [];
        for (var s = 0; s < segments.length; s++) {
          var seg = segments[s];
          if (seg.style) { newSegs.push(seg); continue; }
          var lastIdx = 0;
          var match;
          rule.re.lastIndex = 0;
          while ((match = rule.re.exec(seg.text)) !== null) {
            if (match.index > lastIdx) {
              newSegs.push({ text: seg.text.substring(lastIdx, match.index) });
            }
            newSegs.push({ text: match[1], style: rule.style });
            lastIdx = match.index + match[0].length;
          }
          if (lastIdx < seg.text.length) {
            newSegs.push({ text: seg.text.substring(lastIdx) });
          }
        }
        segments = newSegs;
      }

      var children = [];
      var baseTextStyle = 'line-height:1.8;font-size:28rpx;color:#555;';
      for (var k = 0; k < segments.length; k++) {
        var sg = segments[k];
        var childStyle = sg.style || baseTextStyle;
        children.push({ name: 'span', attrs: { style: childStyle }, children: [{ type: 'text', text: sg.text }] });
      }
      nodes.push({ name: 'div', attrs: { style: 'line-height:1.8;font-size:28rpx;margin-bottom:2rpx;' }, children: children });
    }
    return nodes;
  },

  // 从AI回复中提取核心要点摘要
  extractSummary: function (text, count) {
    if (!text) return [];
    count = count || 4;
    var lines = text.split('\n').filter(function (l) { return l.trim(); });
    var summary = [];
    // 优先提取：章节标题、数字开头的要点、关键句式
    for (var i = 0; i < lines.length && summary.length < count; i++) {
      var line = lines[i].trim();
      if (/^(一[、.]|二[、.]|三[、.]|四[、.]|五[、.]|[123456]\d*[.、)）]|第[一二三])/.test(line) ||
          /^(核心|关键|重点|要点|目标|总结|定义|概念)/.test(line)) {
        summary.push(line.replace(/^[#*\-•\s]+/, ''));
      }
    }
    // 不够数量则补充前几行
    if (summary.length < count) {
      for (var j = 0; j < lines.length && summary.length < count; j++) {
        var l = lines[j].trim();
        if (l && summary.indexOf(l) === -1 && l.length > 5) {
          summary.push(l.length > 40 ? l.substring(0, 40) + '...' : l);
        }
      }
    }
    return summary.slice(0, count);
  },

  // 云数据库同步
  syncSave: function () {
    var user = wx.getStorageSync('user') || {};
    if (!user.user_id) return;
    var data = { _id: user.user_id, userId: user.user_id, updateTime: new Date() };
    ['weak_point', 'mastery_level', 'user_habit', 'error_list', 'kp_history', 'favorites', 'tool_usage'].forEach(function (k) {
      data[k] = wx.getStorageSync(k) || '';
    });
    var db = wx.cloud.database();
    db.collection('user_sync').doc(user.user_id).set({ data: data }).catch(function () {
      db.collection('user_sync').add({ data: data });
    });
  },

  syncLoad: function (callback) {
    var user = wx.getStorageSync('user') || {};
    if (!user.user_id) { if (callback) callback(); return; }
    var that = this;
    // 优先云数据库
    if (wx.cloud) {
      wx.cloud.database().collection('user_sync').doc(user.user_id).get().then(function (res) {
        if (res.data) {
          ['weak_point', 'mastery_level', 'user_habit', 'error_list', 'kp_history', 'favorites', 'tool_usage'].forEach(function (k) {
            if (res.data[k] !== undefined) wx.setStorageSync(k, res.data[k]);
          });
        }
        if (callback) callback();
      }).catch(function () {
        // 云数据库失败，用Python后端
        that.syncLoadHttp(callback);
      });
    } else {
      that.syncLoadHttp(callback);
    }
  },

  syncLoadHttp: function (callback) {
    var user = wx.getStorageSync('user') || {};
    if (!user.user_id) { if (callback) callback(); return; }
    wx.request({
      url: this.globalData.apiBase + '/api/sync/load', method: 'POST',
      data: 'user_id=' + encodeURIComponent(user.user_id),
      header: { 'content-type': 'application/x-www-form-urlencoded' }, timeout: 5000,
      success: function (res) {
        if (res.data && res.data.code === 200 && res.data.data) {
          var d = res.data.data;
          ['weak_point', 'mastery_level', 'user_habit', 'error_list', 'kp_history', 'favorites', 'tool_usage'].forEach(function (k) {
            if (d[k] !== undefined) wx.setStorageSync(k, d[k]);
          });
        }
        if (callback) callback();
      },
      fail: function () { if (callback) callback(); }
    });
  },

  // 获取当前用户ID
  getUserId: function () {
    var user = wx.getStorageSync('user') || {};
    return user.user_id || '';
  },

  // 获取完整规则（系统规则 + 用户偏好）
  getFullRules: function () {
    var rules = this.globalData.SYSTEM_RULES;
    var habit = this.globalData.userHabit || wx.getStorageSync('user_habit') || '';
    if (habit) {
      rules += '\n【用户个性化偏好】后续所有出题、讲解、答疑内容严格贴合以下用户习惯：' + habit;
    }
    return rules;
  },
  globalData: {
    // 自动选择：真机用局域网IP，开发者工具用127.0.0.1
    apiBase: '',
    userInfo: null,
    user: wx.getStorageSync('user') || null,
    userRole: wx.getStorageSync('user_role') || '',
    SYSTEM_RULES: '【全局强制规则】\n' +
      '1. 身份定位：你是资深大学高数专职辅导老师，精通高等数学全部知识点、题型、解题套路、易错点。\n' +
      '2. 符号规范：允许正常使用数学字母、数学符号、标准公式；禁止输出LaTeX代码、反斜杠、frac、int、left 等命令字符，直接使用可视化数学符号如 ∫ lim ² → ÷ 等。\n' +
      '3. 讲解要求：讲解通俗易懂、步骤极致详细、绝不跳步；解题统一使用 第一步、第二步、第三步 分步书写，每一步附带思路与原理说明。\n' +
      '4. 排版要求：段落清晰、适当换行、结构分明；不使用星号、粗体、井号、分割线等多余装饰符号。\n' +
      '5. 适配人群：面向高校学生，兼顾基础薄弱、中等、备考考研三类人群，根据用户水平调整内容深浅。\n' +
      '6. 输出原则：内容真实严谨、数学逻辑无误，针对高数领域深度作答，不闲聊、不偏离题目。'
  }
})
