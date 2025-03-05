import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

function Dashboard({ user, setUser }) {
  const [statistics, setStatistics] = useState({ totalPupils: 0, totalTeachers: 0, pupilStatistics: [] });
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState({
    text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: ''
  });
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [answer, setAnswer] = useState({ question_id: null, selected_option: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'pupil' });

  useEffect(() => {
    if (user && user.token) {
      fetchQuestions();
      if (user.role === 'owner' || user.role === 'admin') {
        fetchStatistics();
      } else if (user.role === 'pupil') {
        fetchPupilStatistics();
      }
    }
  }, [user]);

  const fetchStatistics = async () => {
    try {
      const res = await axios.get('http://localhost:5000/statistics', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setStatistics(res.data);
    } catch (err) {
      console.error('Error fetching statistics:', err);
    }
  };

  const fetchPupilStatistics = async () => {
    try {
      const res = await axios.get('http://localhost:5000/statistics', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const pupilStats = res.data.pupilStatistics.find(stat => stat.username === user.username) || { correctAnswers: 0, incorrectAnswers: 0 };
      setStatistics({ totalPupils: 0, totalTeachers: 0, pupilStatistics: [pupilStats] });
    } catch (err) {
      console.error('Error fetching pupil statistics:', err);
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await axios.get('http://localhost:5000/questions', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setQuestions(res.data);
    } catch (err) {
      console.error('Error fetching questions:', err);
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/questions', newQuestion, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setNewQuestion({ text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_answer: '' });
      fetchQuestions();
    } catch (err) {
      alert('Failed to add question');
    }
  };

  const handleEditQuestion = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://localhost:5000/questions/${editingQuestion.id}`, editingQuestion, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setEditingQuestion(null);
      fetchQuestions();
    } catch (err) {
      alert('Failed to update question');
    }
  };

  const handleDeleteQuestion = async (id) => {
    try {
      await axios.delete(`http://localhost:5000/questions/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      fetchQuestions();
    } catch (err) {
      alert('Failed to delete question');
    }
  };

  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    if (!answer.question_id || !answer.selected_option) {
      alert('Please select a question and answer.');
      return;
    }
    try {
      await axios.post('http://localhost:5000/answers', answer, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setAnswer({ question_id: null, selected_option: '' });
      if (user.role === 'pupil') {
        fetchPupilStatistics(); // Update pupil's statistics after answering
      }
      alert('Answer submitted!');
    } catch (err) {
      alert('Failed to submit answer: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!user || !user.token) {
      alert('You must be logged in to add a user');
      return;
    }
    try {
      await axios.post('http://localhost:5000/users', newUser, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setNewUser({ username: '', password: '', role: 'pupil' });
      if (user.role === 'owner' || user.role === 'admin') {
        fetchStatistics(); // Refresh statistics after adding a user
      }
      alert(`User ${newUser.username} added as ${newUser.role}`);
    } catch (err) {
      alert('Failed to add user: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const handleRemoveUser = async (username) => {
    try {
      const userToRemove = statistics.pupilStatistics.find(stat => stat.username === username);
      if (!userToRemove || !userToRemove.id) return;

      await axios.delete(`http://localhost:5000/users/${userToRemove.id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      fetchStatistics(); // Refresh statistics after removal
      alert(`User ${username} removed`);
    } catch (err) {
      alert('Failed to remove user: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setUser(null);
  };

  if (!user || !user.token) return <div>Please log in to access the dashboard.</div>;

  return (
    <div className="dashboard-container">
      <div className="dashboard-box">
        <h2 className="dashboard-title">Dashboard ({user.role})</h2>
        <button onClick={handleLogout} className="logout-button">Logout</button>

        {/* Questions Section - Visible to All Roles (Pupils Can Answer, Owners/Admins Can Manage) */}
        <div className="questions-section">
          <h3 className="section-title">Questions</h3>
          <ul className="questions-list">
            {questions.map((q) => (
              <li key={q.id} className="question-item">
                <strong>{q.text}</strong><br />
                A: {q.option_a} | B: {q.option_b} | C: {q.option_c} | D: {q.option_d} (Correct: {q.correct_answer})
                {user.role === 'pupil' ? (
                  <form onSubmit={handleSubmitAnswer} className="answer-form">
                    <select
                      value={answer.question_id === q.id ? answer.selected_option : ''}
                      onChange={(e) =>
                        setAnswer({ question_id: q.id, selected_option: e.target.value })
                      }
                      className="answer-select"
                    >
                      <option value="">Select an answer</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                    <button type="submit" className="submit-button" disabled={!answer.question_id || !answer.selected_option}>Submit Answer</button>
                  </form>
                ) : (
                  (user.role === 'owner' || user.role === 'admin') && (
                    <div className="question-actions">
                      <button onClick={() => setEditingQuestion(q)} className="edit-button">Edit</button>
                      <button onClick={() => handleDeleteQuestion(q.id)} className="delete-button">Delete</button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>

          {/* Add/Edit Question - Only for Owners and Admins */}
          {(user.role === 'owner' || user.role === 'admin') && (
            <>
              <h4 className="sub-title">Add New Question</h4>
              <form onSubmit={handleAddQuestion} className="question-form">
                <input
                  type="text"
                  placeholder="Question Text"
                  value={newQuestion.text}
                  onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                  className="question-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Option A"
                  value={newQuestion.option_a}
                  onChange={(e) => setNewQuestion({ ...newQuestion, option_a: e.target.value })}
                  className="question-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Option B"
                  value={newQuestion.option_b}
                  onChange={(e) => setNewQuestion({ ...newQuestion, option_b: e.target.value })}
                  className="question-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Option C"
                  value={newQuestion.option_c}
                  onChange={(e) => setNewQuestion({ ...newQuestion, option_c: e.target.value })}
                  className="question-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Option D"
                  value={newQuestion.option_d}
                  onChange={(e) => setNewQuestion({ ...newQuestion, option_d: e.target.value })}
                  className="question-input"
                  required
                />
                <select
                  value={newQuestion.correct_answer}
                  onChange={(e) => setNewQuestion({ ...newQuestion, correct_answer: e.target.value })}
                  className="question-select"
                  required
                >
                  <option value="">Select Correct Answer</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
                <button type="submit" className="add-question-button">Add Question</button>
              </form>

              {/* Edit Question */}
              {editingQuestion && (
                <div className="edit-question-section">
                  <h4 className="sub-title">Edit Question</h4>
                  <form onSubmit={handleEditQuestion} className="question-form">
                    <input
                      type="text"
                      value={editingQuestion.text}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                      className="question-input"
                      required
                    />
                    <input
                      type="text"
                      value={editingQuestion.option_a}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, option_a: e.target.value })}
                      className="question-input"
                      required
                    />
                    <input
                      type="text"
                      value={editingQuestion.option_b}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, option_b: e.target.value })}
                      className="question-input"
                      required
                    />
                    <input
                      type="text"
                      value={editingQuestion.option_c}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, option_c: e.target.value })}
                      className="question-input"
                      required
                    />
                    <input
                      type="text"
                      value={editingQuestion.option_d}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, option_d: e.target.value })}
                      className="question-input"
                      required
                    />
                    <select
                      value={editingQuestion.correct_answer}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, correct_answer: e.target.value })}
                      className="question-select"
                      required
                    >
                      <option value="">Select Correct Answer</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                    <button type="submit" className="update-question-button">Update Question</button>
                    <button type="button" onClick={() => setEditingQuestion(null)} className="cancel-button">Cancel</button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* Add New User Section - Only for Owners and Admins */}
          {(user.role === 'owner' || user.role === 'admin') && (
            <div className="add-user-section">
              <h3 className="section-title">Add New User</h3>
              <form onSubmit={handleAddUser} className="user-form">
                <input
                  type="text"
                  placeholder="Username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="user-input"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="user-input"
                  required
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="role-select"
                  disabled={user.role !== 'owner'} // Only owners can select 'admin'
                >
                  <option value="pupil">Pupil</option>
                  {user.role === 'owner' && <option value="admin">Teacher</option>}
                </select>
                <button type="submit" className="add-user-button">Add User</button>
              </form>
            </div>
          )}

          {/* User Statistics for Owners/Admins Only (with Remove Button) */}
          {(user.role === 'owner' || user.role === 'admin') && (
            <div className="statistics-section">
              <h3 className="section-title">User Statistics</h3>
              <p>Total Pupils: {statistics.totalPupils}</p>
              <p>Total Teachers: {statistics.totalTeachers}</p>
              <h4>Pupil Answer Statistics</h4>
              {statistics.pupilStatistics.length > 0 ? (
                <ul className="statistics-list">
                  {statistics.pupilStatistics.map((stat) => (
                    <li key={stat.username} className="statistic-item">
                      {stat.username}: {stat.correctAnswers} correct, {stat.incorrectAnswers} incorrect
                      <button onClick={() => handleRemoveUser(stat.username)} className="remove-button">Remove</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No pupil statistics available</p>
              )}
            </div>
          )}

          {/* Pupil Statistics */}
          {user.role === 'pupil' && (
            <div className="statistics-section">
              <h3 className="section-title">Your Statistics</h3>
              <p>{user.username}: {statistics.pupilStatistics[0]?.correctAnswers || 0} correct, {statistics.pupilStatistics[0]?.incorrectAnswers || 0} incorrect</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;