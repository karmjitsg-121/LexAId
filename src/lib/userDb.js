// A simple local database using localStorage for managing registered users and sessions
export const userDb = {
  getUsers() {
    try {
      const users = localStorage.getItem('lexaid_registered_users');
      return users ? JSON.parse(users) : [];
    } catch (e) {
      console.error('Failed to read user database:', e);
      return [];
    }
  },

  saveUsers(users) {
    try {
      localStorage.setItem('lexaid_registered_users', JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save user database:', e);
    }
  },

  checkEmailExists(email) {
    if (!email) return false;
    const users = this.getUsers();
    return users.some(u => u.email.toLowerCase() === email.toLowerCase().trim());
  },

  registerUser(email, password, fullName) {
    const cleanEmail = email.toLowerCase().trim();
    if (this.checkEmailExists(cleanEmail)) {
      throw new Error('Email address is already registered');
    }
    const users = this.getUsers();
    const newUser = {
      id: 'usr_' + Math.random().toString(36).substring(2, 11),
      email: cleanEmail,
      password, // Local plain-text password for easy testing
      fullName: fullName.trim(),
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  },

  loginUser(email, password) {
    const cleanEmail = email.toLowerCase().trim();
    const users = this.getUsers();
    const user = users.find(
      u => u.email.toLowerCase() === cleanEmail && u.password === password
    );
    if (!user) {
      throw new Error('Invalid email or password');
    }
    return user;
  }
};
