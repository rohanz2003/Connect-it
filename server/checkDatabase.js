require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/chatapp';
(async () => {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const cols = await db.listCollections().toArray();
    console.log('Collections:', cols.map(c => c.name).join(', '));
    const check = async (name) => {
      const coll = db.collection(name);
      const count = await coll.countDocuments();
      console.log('\nCollection ' + name + ': count = ' + count);
      const sample = await coll.find({}).limit(3).toArray();
      console.log('Sample documents:', JSON.stringify(sample, null, 2));
    };
    for (const name of ['feedbacks', 'users', 'messages']) {
      if (cols.some(c => c.name === name)) await check(name);
      else console.log('\nCollection ' + name + ' does not exist');
    }
  } catch (err) {
    console.error('DB error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
