const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

exports.main = async (event, context) => {
  const { username, password } = event;
  if (!username || !password) return { code: 400, msg: '请填写用户名和密码' };
  const hashed = hashPassword(password);
  const res = await db.collection('users').where({ username, password: hashed }).get();
  if (res.data.length > 0) {
    const user = res.data[0];
    return { code: 200, msg: '登录成功', data: { user_id: user._id, username: user.username } };
  }
  return { code: 401, msg: '用户名或密码错误' };
};
