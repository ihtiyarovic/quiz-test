const express = require('express');
const knex = require('knex');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const url = require('url');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Configure knex with Railway PostgreSQL details
const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  },
});

// Debug logs
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('Parsed Connection:', url.parse(process.env.DATABASE_URL || ''));

// Initialize database schema and create owner
const initDb = async () => {
  try {
    const usersTableExists = await db.schema.hasTable('users');
    if (!usersTableExists) {
      await db.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('username', 150).unique().notNullable();
        table.string('password', 150).notNullable();
        table.string('role', 50).notNullable().defaultTo('pupil');
      });
    } else {
      const constraints = await db('information_schema.table_constraints')
        .where({
          table_name: 'users',
          constraint_type: 'UNIQUE',
          constraint_name: 'users_username_unique',
        })
        .first();
      if (!constraints) {
        await db.schema.alterTable('users', (table) => {
          table.unique('username', 'users_username_unique');
        });
      }
    }

    await db.schema.createTableIfNotExists('questions', (table) => {
      table.increments('id').primary();
      table.string('text', 500).notNullable();
      table.string('option_a', 150).notNullable();
      table.string('option_b', 150).notNullable();
      table.string('option_c', 150).notNullable();
      table.string('option_d', 150).notNullable();
      table.string('correct_answer', 1).notNullable();
    });

    const answersTableExists = await db.schema.hasTable('answers');
    if (!answersTableExists) {
      await db.schema.createTable('answers', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
        table.integer('question_id').unsigned().references('id').inTable('questions').onDelete('CASCADE');
        table.string('selected_option', 1).notNullable();
        table.timestamp('timestamp').defaultTo(db.fn.now());
      });
    } else {
      const userForeignKeys = await db('information_schema.table_constraints')
        .where({
          table_name: 'answers',
          constraint_type: 'FOREIGN KEY',
          constraint_name: 'answers_user_id_foreign',
        })
        .first();
      if (!userForeignKeys) {
        await db.schema.alterTable('answers', (table) => {
          table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        });
      }

      const questionForeignKeys = await db('information_schema.table_constraints')
        .where({
          table_name: 'answers',
          constraint_type: 'FOREIGN KEY',
          constraint_name: 'answers_question_id_foreign',
        })
        .first();
      if (!questionForeignKeys) {
        await db.schema.alterTable('answers', (table) => {
          table.foreign('question_id').references('id').inTable('questions').onDelete('CASCADE');
        });
      }
    }

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
    console.log('Authenticated user:', req.user); // Debug log
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
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username === 'xasan') {
    return res.status(400).json({ error: 'Username "xasan" is reserved for the owner.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await db('users').insert({ username, password: hashedPassword, role: 'pupil' });
    res.status(201).json({ message: 'User registered as pupil' });
  } catch (err) {
    console.error('Error registering user:', err); // Log the error
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Failed to add user', details: err.message });
    }
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
  if (!text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
    return res.status(400).json({ error: 'All fields (text, options a-d, correct_answer) are required' });
  }
  if (!['a', 'b', 'c', 'd'].includes(correct_answer)) {
    return res.status(400).json({ error: 'correct_answer must be one of a, b, c, or d' });
  }
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
    console.error('Error adding question:', err); // Log the error
    res.status(500).json({ error: 'Failed to add question', details: err.message });
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
    console.error('Error updating question:', err);
    res.status(500).json({ error: 'Failed to update question', details: err.message });
  }
});

app.delete('/questions/:id', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  const { id } = req.params;
  try {
    await db('questions').where({ id }).del();
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error('Error deleting question:', err);
    res.status(500).json({ error: 'Failed to delete question', details: err.message });
  }
});

// **Answer Route**
app.post('/answers', authenticate, async (req, res) => {
  const { question_id, selected_option } = req.body;
  if (!question_id || !selected_option) {
    return res.status(400).json({ error: 'question_id and selected_option are required' });
  }
  try {
    await db('answers').insert({
      user_id: req.user.id,
      question_id,
      selected_option,
    });
    res.status(201).json({ message: 'Answer submitted' });
  } catch (err) {
    console.error('Error submitting answer:', err);
    res.status(500).json({ error: 'Failed to submit answer', details: err.message });
  }
});

// **User Management Routes**
app.get('/users', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  try {
    const users = await db('users').select('id', 'username', 'role');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users', details: err.message });
  }
});

app.put('/users/:id/role', authenticate, requireRole(['owner']), async (req, res) => {
  const { role } = req.body;
  if (['owner', 'admin', 'pupil'].includes(role)) {
    try {
      await db('users').where({ id: req.params.id }).update({ role });
      res.json({ message: 'Role updated' });
    } catch (err) {
      console.error('Error updating role:', err);
      res.status(500).json({ error: 'Failed to update role', details: err.message });
    }
  } else {
    res.status(400).json({ error: 'Invalid role' });
  }
});

app.delete('/users/:id', authenticate, requireRole(['owner', 'admin']), async (req, res) => {
  try {
    await db('users').where({ id: req.params.id }).del();
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

app.post('/users', authenticate, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
  }
  if (role === 'admin' && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can add admins' });
  }
  if (!['admin', 'pupil'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await db('users').insert({ username, password: hashedPassword, role });
    res.status(201).json({ message: `User ${username} added as ${role}` });
  } catch (err) {
    console.error('Error adding user:', err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Failed to add user', details: err.message });
    }
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
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: 'Failed to fetch statistics', details: err.message });
  }
});

// Serve frontend in production
const path = require('path');
app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Ensure app listens on 0.0.0.0 for Railway
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
