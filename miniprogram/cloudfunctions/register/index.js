const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

exports.main = async (event, context) => {
  const { username, password } = event;
  if (!username || username.length < 2) return { code: 400, msg: '用户名至少2位' };
  if (!password || password.length < 6) return { code: 400, msg: '密码至少6位' };
  // 检查用户名是否已存在
  const exist = await db.collection('users').where({ username }).get();
  if (exist.data.length > 0) return { code: 400, msg: '用户名已存在' };
  // 创建用户
  const hashed = hashPassword(password);
  const res = await db.collection('users').add({ data: { username, password: hashed, createTime: new Date() } });
  return { code: 200, msg: '注册成功', data: { user_id: res._id, username } };
};
