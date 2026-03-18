const { MongoClient } = require('mongodb');
require('dotenv').config();

async function test() {
  const client = new MongoClient(process.env.DATABASE_URL);
  await client.connect();
  const db = client.db('bloom');
  
  console.log('=== Testing MongoDB directly ===\n');
  
  // Check brand
  const brand = await db.collection('Brand').findOne({ _id: 'cmmtgiol30000q8a7dnlvcccc' });
  console.log('Brand found:', brand ? 'YES' : 'NO');
  if (brand) {
    console.log('Brand name:', brand.name);
    console.log('Brand _id type:', typeof brand._id);
    console.log('Brand _id value:', brand._id);
  }
  
  // List all brand IDs
  console.log('\n=== All brands in MongoDB ===');
  const brands = await db.collection('Brand').find({}).toArray();
  brands.forEach(b => {
    console.log(`  ${b._id} (${typeof b._id}): ${b.name}`);
  });
  
  await client.close();
}

test().catch(console.error);
