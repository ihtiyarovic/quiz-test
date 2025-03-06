const express = require('express');
const knex = require('knex');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs'); // For CA certificate
const url = require('url'); // Added to parse DATABASE_URL

dotenv.config();

// Load the CA certificate (save to ca-certificate.crt in your project)
const caCertificate = fs.readFileSync('./ca-certificate.crt').toString();

const app = express();
app.use(express.json());
app.use(cors());

// Configure knex with Aiven PostgreSQL details
const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL || 'postgres://avnadmin:AVNS_94C8Y47XDBR0rdeJZa@pg-37afeea-hasanojabdurashulov309-a86c.aivencloud.com:15915/defaultdb?sslmode=require',
    ssl: {
      rejectUnauthorized: true,
      ca: caCertificate,
    },
  },
});

// Debug logs to verify the DATABASE_URL
console.log('Raw DATABASE_URL:', process.env.DATABASE_URL);
const parsedUrl = url.parse(process.env.DATABASE_URL || '');
console.log('Parsed URL:', {
  protocol: parsedUrl.protocol,
  hostname: parsedUrl.hostname,
  port: parsedUrl.port,
  pathname: parsedUrl.pathname,
});

// Initialize database schema and create owner
const initDb = async () => {
  try {
    await db.schema.createTableIfNotExists('users', (table) => {
      table.increments('id').primary();
      table.string('username', 150).unique().notNullable();
      table.string('password', 150).notNullable();
      table.string('role', 50).notNullable().defaultTo('pupil');
    });

    await db.schema.createTableIfNotExists('questions', (table) => {
      table.increments('id').primary();
      table.string('text', 500).notNullable();
      table.string('option_a', 150).notNullable();
      table.string('option_b', 150).notNullable();
      table.string('option_c', 150).notNullable();
      table.string('option_d', 150).notNullable();
      table.string('correct_answer', 1).notNullable();
    });

    await db.schema.createTableIfNotExists('answers', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('question_id').unsigned().references('id').inTable('questions').onDelete('CASCADE');
      table.string('selected_option', 1).notNullable();
      table.timestamp('timestamp').defaultTo(db.fn.now());
    });

    const owner = await db('users').where({ username: 'xasan' }).first();
    if (!owner) {
      const hashedPassword = await bcrypt.hash('+998770816393', 10);
      await db('users').insert({
        username: 'xasan',
        password: hashedPassword,
        role: 'owner',
      });
      console.log('Owner "xasan" created successfully.');
    }
  } catch (err) {
    console.error('DB Error:', err);
  }
};

initDb();

// Test connection on startup
(async () => {
  try {
    const version = await db.raw('SELECT VERSION()');
    console.log('Database connection successful. Version:', version.rows[0].version);
  } catch (err) {
    console.error('Database connection error:', err);
  }
})();

// Middleware for authentication
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware for role-based access
const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// **Authentication Routes**
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (username === 'xasan') {
    return res.status(400).json({ error: 'Username "xasan" is reserved for the owner.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await db('users').insert({ username, password: hashedPassword, role: 'pupil' });
    res.status(201).json({ message: 'User registered as pupil' });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db('users').where({ username }).first();
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    res.json({ token, role: user.role });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// **Question Routes**
app.get('/questions', authenticate, async (req, res) => {
  const questions = await db('questions').select();
  res.json(questions);
});

app.post('/questions', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  const { text, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    await db('questions').insert({
      text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_answer,
    });
    res.status(201).json({ message: 'Question added' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add question' });
  }
});

app.put('/questions/:id', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  const { id } = req.params;
  const { text, option_a, option_b, option_c, option_d, correct_answer } = req.body;
  try {
    await db('questions').where({ id }).update({
      text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_answer,
    });
    res.json({ message: 'Question updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update question' });
  }
});

app.delete('/questions/:id', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await db('questions').where({ id }).del();
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// **Answer Route**
app.post('/answers', authenticate, async (req, res) => {
  const { question_id, selected_option } = req.body;
  try {
    await db('answers').insert({
      user_id: req.user.id,
      question_id,
      selected_option,
    });
    res.status(201).json({ message: 'Answer submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// **User Management Routes (Owner only)**
app.get('/users', authenticate, requireRole(['owner']), async (req, res) => {
  const users = await db('users').select('id', 'username', 'role');
  res.json(users);
});

app.put('/users/:id/role', authenticate, requireRole(['owner']), async (req, res) => {
  const { role } = req.body;
  if (['owner', 'admin', 'pupil'].includes(role)) {
    await db('users').where({ id: req.params.id }).update({ role });
    res.json({ message: 'Role updated' });
  } else {
    res.status(400).json({ error: 'Invalid role' });
  }
});

app.delete('/users/:id', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  try {
    await db('users').where({ id: req.params.id }).del();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// **Statistics Route**
app.get('/statistics', authenticate, requireRole(['owner', 'admin', 'pupil']), async (req, res) => {
  try {
    const pupils = await db('users').where({ role: 'pupil' }).count('id as count');
    const totalPupils = pupils[0].count;
    const teachers = await db('users').where({ role: 'admin' }).count('id as count');
    const totalTeachers = teachers[0].count;

    const pupilsList = await db('users').where({ role: 'pupil' }).select('id', 'username');
    const pupilStatistics = await Promise.all(
      pupilsList.map(async (pupil) => {
        const answers = await db('answers')
          .join('questions', 'answers.question_id', 'questions.id')
          .where({ 'answers.user_id': pupil.id })
          .select('answers.selected_option', 'questions.correct_answer');
        const correctAnswers = answers.filter(
          (ans) => ans.selected_option === ans.correct_answer
        ).length;
        const incorrectAnswers = answers.length - correctAnswers;
        return { id: pupil.id, username: pupil.username, correctAnswers, incorrectAnswers };
      })
    );

    if (req.user.role === 'pupil') {
      const pupilStats = pupilStatistics.find(stat => stat.username === req.user.username) || { correctAnswers: 0, incorrectAnswers: 0 };
      res.json({ totalPupils: 1, totalTeachers: 0, pupilStatistics: [pupilStats] });
    } else {
      res.json({ totalPupils, totalTeachers, pupilStatistics });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

app.post('/users', authenticate, async (req, res) => {
  const { username, password, role } = req.body;

  if (role === 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can add admins' });
  }

  if (!['admin', 'pupil'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db('users').insert({ username, password: hashedPassword, role });
    res.status(201).json({ message: `User ${username} added as ${role}` });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

// Serve frontend in production
const path = require('path');
app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Ensure app listens on 0.0.0.0 for Railway or other platforms
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
