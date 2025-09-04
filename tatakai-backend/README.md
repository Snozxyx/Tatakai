# Tatakai Backend Server

A production-ready backend server for the Tatakai anime streaming platform, providing user authentication, progress tracking, favorites management, and anime data integration.

## Features

### Core Functionality
- **User Authentication**: Registration, login, JWT-based authentication
- **User Profiles**: Customizable profiles with preferences and settings
- **Watch History**: Track anime viewing progress across episodes
- **Favorites**: Save and manage favorite anime with ratings and notes
- **Anime Data**: Proxy and enhance HiAnime API with user-specific data
- **Skip Times**: Integration with AniSkip API for intro/outro detection

### Security & Performance
- **Helmet**: Security headers and protection
- **Rate Limiting**: Prevent API abuse
- **CORS**: Configurable cross-origin resource sharing
- **Compression**: Response compression for better performance
- **Input Validation**: Comprehensive validation with express-validator
- **Password Hashing**: Secure bcrypt password hashing

### Database
- **MongoDB**: Document-based storage with Mongoose ODM
- **Optimized Indexes**: Performance-optimized database queries
- **Data Relationships**: Proper user data associations
- **Aggregation**: Complex queries for analytics and recommendations

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/refresh` - Refresh JWT token

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `PUT /api/user/password` - Change password
- `DELETE /api/user/account` - Deactivate account

### Watch History
- `GET /api/watch-history` - Get watch history (paginated)
- `GET /api/watch-history/recent` - Get recently watched anime
- `GET /api/watch-history/anime/:animeId` - Get progress for specific anime
- `POST /api/watch-history` - Add/update watch progress
- `DELETE /api/watch-history/:id` - Delete watch history entry
- `DELETE /api/watch-history/anime/:animeId` - Clear anime progress

### Favorites
- `GET /api/favorites` - Get favorite anime (paginated, sortable)
- `GET /api/favorites/check/:animeId` - Check if anime is favorited
- `GET /api/favorites/stats` - Get favorite statistics
- `POST /api/favorites` - Add anime to favorites
- `PUT /api/favorites/:animeId` - Update favorite (rating, notes)
- `DELETE /api/favorites/:animeId` - Remove from favorites

### Anime Data
- `GET /api/anime/home` - Get home page data
- `GET /api/anime/search` - Search anime
- `GET /api/anime/info/:id` - Get anime information (with user data if authenticated)
- `GET /api/anime/episodes/:id` - Get anime episodes
- `GET /api/anime/servers/:episodeId` - Get episode servers
- `GET /api/anime/sources/:episodeId` - Get episode sources
- `GET /api/anime/skip-times/:malId/:episode` - Get skip times from AniSkip
- `GET /api/anime/category/:category` - Get anime by category
- `GET /api/anime/genre/:genre` - Get anime by genre

## Installation

### Prerequisites
- Node.js 18+ 
- MongoDB 4.4+
- npm or yarn

### Setup

1. **Clone and navigate to backend directory:**
   ```bash
   cd tatakai-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Configuration:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/tatakai-db
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRE=7d
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
   ```

4. **Start MongoDB** (if running locally):
   ```bash
   mongod
   ```

5. **Run the server:**
   
   **Development mode:**
   ```bash
   npm run dev
   ```
   
   **Production mode:**
   ```bash
   npm start
   ```

## Project Structure

```
tatakai-backend/
├── src/
│   ├── models/           # MongoDB schemas
│   │   ├── User.js       # User authentication model
│   │   ├── WatchHistory.js # Watch progress tracking
│   │   └── Favorite.js   # Favorite anime management
│   ├── routes/           # API route handlers
│   │   ├── auth.js       # Authentication routes
│   │   ├── user.js       # User management routes
│   │   ├── watchHistory.js # Watch history routes
│   │   ├── favorites.js  # Favorites routes
│   │   └── anime.js      # Anime data routes
│   ├── middleware/       # Custom middleware
│   │   └── auth.js       # JWT authentication middleware
│   └── index.js          # Main server file
├── .env.example          # Environment variables template
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/tatakai-db` |
| `JWT_SECRET` | JWT signing secret | **Required** |
| `JWT_EXPIRE` | JWT expiration time | `7d` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000,http://localhost:8080` |
| `HIANIME_API_BASE_URL` | HiAnime API base URL | `https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime` |
| `ANISKIP_API_BASE_URL` | AniSkip API base URL | `https://api.aniskip.com/v2` |

## Data Models

### User Model
- Authentication data (username, email, password)
- Profile information (display name, avatar, bio)
- User preferences (theme, language, autoplay settings)
- Account status and timestamps

### Watch History Model
- User and anime associations
- Episode progress tracking
- Completion status and timestamps
- Aggregation methods for analytics

### Favorite Model
- User anime favorites
- Personal ratings and notes
- Genre and type categorization
- Statistical analysis methods

## Development

### Adding New Routes
1. Create route file in `src/routes/`
2. Import in `src/index.js`
3. Add route middleware: `app.use('/api/endpoint', routeHandler)`

### Database Queries
- Use Mongoose aggregation for complex queries
- Implement proper indexing for performance
- Add pagination for large datasets

### Authentication
- Protected routes use `auth` middleware
- Optional authentication uses `optionalAuth` middleware
- JWT tokens include user ID for efficient lookups

## Production Deployment

1. **Environment Setup:**
   - Set `NODE_ENV=production`
   - Use strong JWT secret
   - Configure MongoDB Atlas or production DB
   - Set up proper CORS origins

2. **Security:**
   - Enable HTTPS
   - Configure firewall rules
   - Set up monitoring and logging
   - Implement backup strategies

3. **Performance:**
   - Use PM2 for process management
   - Configure MongoDB indexes
   - Set up caching if needed
   - Monitor resource usage

## Health Check

The server provides a health check endpoint:
```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "environment": "development"
}
```

## Integration with Frontend Apps

The backend is designed to work with both:
- **Tatakai React App** (Next.js) - Web interface
- **Tatakai webOS App** - TV interface

Both apps can use the same API endpoints with different UI implementations for user authentication, progress tracking, and favorites management.