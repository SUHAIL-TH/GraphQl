// package.json


// .env
// MONGODB_URI=mongodb://localhost:27017/graphql_users
JWT_SECRET=your_super_secret_jwt_key_here
PORT=4000

// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  age: {
    type: Number,
    min: 0,
    max: 120
  },
  role: {
    type: String,
    enum: ['USER', 'ADMIN', 'MODERATOR'],
    default: 'USER'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get full name virtual
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', userSchema);

// schema/typeDefs.js
const { gql } = require('apollo-server-express');

const typeDefs = gql`
  # Scalar types
  scalar Date

  # Enums
  enum Role {
    USER
    ADMIN
    MODERATOR
  }

  enum SortOrder {
    ASC
    DESC
  }

  # Input types
  input RegisterInput {
    username: String!
    email: String!
    password: String!
    firstName: String!
    lastName: String!
    age: Int
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input UpdateUserInput {
    username: String
    email: String
    firstName: String
    lastName: String
    age: Int
    role: Role
    isActive: Boolean
  }

  input UserFilterInput {
    username: String
    email: String
    role: Role
    isActive: Boolean
    ageMin: Int
    ageMax: Int
  }

  input UserSortInput {
    field: String!
    order: SortOrder!
  }

  # Object types
  type User {
    id: ID!
    username: String!
    email: String!
    firstName: String!
    lastName: String!
    fullName: String!
    age: Int
    role: Role!
    isActive: Boolean!
    createdAt: Date!
    updatedAt: Date!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type UserConnection {
    users: [User!]!
    totalCount: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type DeleteResponse {
    success: Boolean!
    message: String!
  }

  # Queries
  type Query {
    # Get current user (requires authentication)
    me: User

    # Get all users with pagination and filtering
    users(
      filter: UserFilterInput
      sort: UserSortInput
      limit: Int = 10
      offset: Int = 0
    ): UserConnection!

    # Get user by ID
    user(id: ID!): User

    # Search users by username or email
    searchUsers(query: String!): [User!]!

    # Get user statistics
    userStats: UserStats!
  }

  type UserStats {
    totalUsers: Int!
    activeUsers: Int!
    inactiveUsers: Int!
    adminUsers: Int!
    moderatorUsers: Int!
    regularUsers: Int!
  }

  # Mutations
  type Mutation {
    # Authentication
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!

    # User management (requires authentication)
    updateProfile(input: UpdateUserInput!): User!
    
    # Admin operations (requires admin role)
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): DeleteResponse!
    activateUser(id: ID!): User!
    deactivateUser(id: ID!): User!
    changeUserRole(id: ID!, role: Role!): User!
  }
`;

module.exports = typeDefs;

// schema/resolvers.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { AuthenticationError, ForbiddenError, UserInputError } = require('apollo-server-express');

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Helper function to require authentication
const requireAuth = (user) => {
  if (!user) {
    throw new AuthenticationError('You must be logged in to perform this action');
  }
};

// Helper function to require admin role
const requireAdmin = (user) => {
  requireAuth(user);
  if (user.role !== 'ADMIN') {
    throw new ForbiddenError('You must be an admin to perform this action');
  }
};

const resolvers = {
  Query: {
    me: async (parent, args, { user }) => {
      requireAuth(user);
      return user;
    },

    users: async (parent, { filter = {}, sort, limit = 10, offset = 0 }, { user }) => {
      requireAuth(user);

      // Build filter query
      const query = {};
      if (filter.username) query.username = new RegExp(filter.username, 'i');
      if (filter.email) query.email = new RegExp(filter.email, 'i');
      if (filter.role) query.role = filter.role;
      if (filter.isActive !== undefined) query.isActive = filter.isActive;
      if (filter.ageMin || filter.ageMax) {
        query.age = {};
        if (filter.ageMin) query.age.$gte = filter.ageMin;
        if (filter.ageMax) query.age.$lte = filter.ageMax;
      }

      // Build sort options
      const sortOptions = {};
      if (sort) {
        sortOptions[sort.field] = sort.order === 'ASC' ? 1 : -1;
      } else {
        sortOptions.createdAt = -1; // Default sort by newest first
      }

      const users = await User.find(query)
        .sort(sortOptions)
        .limit(limit)
        .skip(offset)
        .select('-password');

      const totalCount = await User.countDocuments(query);

      return {
        users,
        totalCount,
        hasNextPage: offset + limit < totalCount,
        hasPreviousPage: offset > 0
      };
    },

    user: async (parent, { id }, { user }) => {
      requireAuth(user);
      const foundUser = await User.findById(id).select('-password');
      if (!foundUser) {
        throw new UserInputError('User not found');
      }
      return foundUser;
    },

    searchUsers: async (parent, { query }, { user }) => {
      requireAuth(user);
      return await User.find({
        $or: [
          { username: new RegExp(query, 'i') },
          { email: new RegExp(query, 'i') },
          { firstName: new RegExp(query, 'i') },
          { lastName: new RegExp(query, 'i') }
        ]
      }).select('-password').limit(20);
    },

    userStats: async (parent, args, { user }) => {
      requireAdmin(user);

      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const inactiveUsers = await User.countDocuments({ isActive: false });
      const adminUsers = await User.countDocuments({ role: 'ADMIN' });
      const moderatorUsers = await User.countDocuments({ role: 'MODERATOR' });
      const regularUsers = await User.countDocuments({ role: 'USER' });

      return {
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers,
        moderatorUsers,
        regularUsers
      };
    }
  },

  Mutation: {
    register: async (parent, { input }) => {
      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email: input.email }, { username: input.username }]
      });

      if (existingUser) {
        throw new UserInputError('User with this email or username already exists');
      }

      // Create new user
      const user = new User(input);
      await user.save();

      // Generate token
      const token = generateToken(user._id);

      return {
        token,
        user: { ...user.toObject(), password: undefined }
      };
    },

    login: async (parent, { input }) => {
      // Find user by email
      const user = await User.findOne({ email: input.email });
      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Check password
      const isValidPassword = await user.comparePassword(input.password);
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AuthenticationError('Your account has been deactivated');
      }

      // Generate token
      const token = generateToken(user._id);

      return {
        token,
        user: { ...user.toObject(), password: undefined }
      };
    },

    updateProfile: async (parent, { input }, { user }) => {
      requireAuth(user);

      // Don't allow role changes through profile update
      delete input.role;

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        input,
        { new: true, runValidators: true }
      ).select('-password');

      return updatedUser;
    },

    updateUser: async (parent, { id, input }, { user }) => {
      requireAdmin(user);

      const updatedUser = await User.findByIdAndUpdate(
        id,
        input,
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        throw new UserInputError('User not found');
      }

      return updatedUser;
    },

    deleteUser: async (parent, { id }, { user }) => {
      requireAdmin(user);

      // Don't allow admin to delete themselves
      if (user._id.toString() === id) {
        throw new ForbiddenError('You cannot delete your own account');
      }

      const deletedUser = await User.findByIdAndDelete(id);
      if (!deletedUser) {
        throw new UserInputError('User not found');
      }

      return {
        success: true,
        message: 'User deleted successfully'
      };
    },

    activateUser: async (parent, { id }, { user }) => {
      requireAdmin(user);

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { isActive: true },
        { new: true }
      ).select('-password');

      if (!updatedUser) {
        throw new UserInputError('User not found');
      }

      return updatedUser;
    },

    deactivateUser: async (parent, { id }, { user }) => {
      requireAdmin(user);

      // Don't allow admin to deactivate themselves
      if (user._id.toString() === id) {
        throw new ForbiddenError('You cannot deactivate your own account');
      }

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
      ).select('-password');

      if (!updatedUser) {
        throw new UserInputError('User not found');
      }

      return updatedUser;
    },

    changeUserRole: async (parent, { id, role }, { user }) => {
      requireAdmin(user);

      // Don't allow admin to change their own role
      if (user._id.toString() === id) {
        throw new ForbiddenError('You cannot change your own role');
      }

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { role },
        { new: true }
      ).select('-password');

      if (!updatedUser) {
        throw new UserInputError('User not found');
      }

      return updatedUser;
    }
  },

  User: {
    fullName: (user) => `${user.firstName} ${user.lastName}`
  }
};

module.exports = resolvers;

// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getUser = async (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    return user;
  } catch (error) {
    return null;
  }
};

module.exports = { getUser };

// server.js
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const mongoose = require('mongoose');
require('dotenv').config();

const typeDefs = require('./schema/typeDefs');
const resolvers = require('./schema/resolvers');
const { getUser } = require('./middleware/auth');

async function startServer() {
  const app = express();

  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }

  // Create Apollo Server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      // Get user from token
      const user = await getUser(req);
      return { user };
    },
    // Enable GraphQL Playground in development
    introspection: true,
    playground: true,
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}${server.graphqlPath}`);
  });
}

startServer().catch(error => {
  console.error('Error starting server:', error);
});

// Example queries and mutations for testing

/*
1. Register a new user:
mutation {
  register(input: {
    username: "johndoe"
    email: "john@example.com"
    password: "password123"
    firstName: "John"
    lastName: "Doe"
    age: 30
  }) {
    token
    user {
      id
      username
      email
      fullName
      role
    }
  }
}

2. Login:
mutation {
  login(input: {
    email: "john@example.com"
    password: "password123"
  }) {
    token
    user {
      id
      username
      email
      fullName
    }
  }
}

3. Get current user (requires Authorization header):
query {
  me {
    id
    username
    email
    fullName
    role
    isActive
  }
}

4. Get all users with filtering:
query {
  users(
    filter: { role: USER, isActive: true }
    sort: { field: "createdAt", order: DESC }
    limit: 5
  ) {
    users {
      id
      username
      email
      fullName
      role
    }
    totalCount
    hasNextPage
  }
}

5. Update profile:
mutation {
  updateProfile(input: {
    firstName: "Jane"
    lastName: "Smith"
    age: 25
  }) {
    id
    fullName
    age
  }
}

6. Admin: Get user statistics:
query {
  userStats {
    totalUsers
    activeUsers
    adminUsers
  }
}
*/