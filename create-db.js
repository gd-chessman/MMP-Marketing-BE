const { Client } = require('pg');

async function createDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server');

    // Kiểm tra xem database có tồn tại không
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      ['my_project']
    );

    // Nếu database chưa tồn tại, tạo mới
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE my_project`);
      console.log('Database my_project created successfully');
    } else {
      console.log('Database my_project already exists');
    }
  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL server');
  }
}

createDatabase().catch(console.error); 