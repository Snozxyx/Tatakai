# Tatakai - Anime Streaming Platform

![Tatakai Logo](logo.png)

Tatakai is a comprehensive anime streaming platform built with modern web technologies, featuring a web application, backend API server, and smart TV application for webOS devices. The platform provides seamless anime streaming with user authentication, progress tracking, favorites management, and optimized viewing experiences across different devices.

## 🎯 Features

### Core Platform Features
- **Multi-Device Support**: Web application and webOS TV app
- **User Authentication**: Secure registration and login system
- **Progress Tracking**: Watch history and episode progress synchronization
- **Favorites Management**: Save and organize favorite anime
- **Advanced Search**: Search anime with filters and categories
- **Quality Streaming**: HLS video streaming with quality selection
- **Subtitle Support**: Multiple subtitle options
- **Remote Control Navigation**: TV-optimized interface with spatial navigation

### Device-Specific Features
- **Web App**: Responsive design for desktop and mobile browsers
- **webOS TV App**: Remote control navigation with TV-optimized UI
- **Backend API**: RESTful API with MongoDB integration

## 🏗️ Architecture

The Tatakai platform consists of three main components:

```
Tatakai Platform
├── 🌐 tatakai-app/          # Next.js Web Application
├── 🔧 tatakai-backend/      # Node.js Backend Server
├── 📺 tatakai-webos-app/    # webOS Smart TV Application
└── 📚 docs/                 # API Documentation
```

### Technology Stack

| Component | Technologies |
|-----------|-------------|
| **Web App** | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI |
| **Backend** | Node.js, Express, MongoDB, JWT, bcrypt |
| **webOS App** | Vanilla JavaScript, HLS.js, CSS3, webOS APIs |
| **API Integration** | HiAnime API, AniSkip API |

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **MongoDB** 4.4+ (for backend)
- **npm** or **yarn**
- **webOS CLI tools** (for TV app development)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Snozxyx/Tatakai.git
   cd Tatakai
   ```

2. **Install dependencies for all components:**
   ```bash
   # Backend setup
   cd tatakai-backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   
   # Web app setup
   cd ../tatakai-app
   npm install
   
   # webOS app setup
   cd ../tatakai-webos-app
   npm install
   ```

3. **Start the development environment:**
   ```bash
   # Terminal 1: Start MongoDB (if running locally)
   mongod
   
   # Terminal 2: Start backend server
   cd tatakai-backend
   npm run dev
   
   # Terminal 3: Start web application
   cd tatakai-app
   npm run dev
   
   # Terminal 4: Start webOS app (optional)
   cd tatakai-webos-app
   npm run serve
   ```

4. **Access the applications:**
   - **Web App**: http://localhost:3000
   - **Backend API**: http://localhost:5000
   - **webOS App**: http://localhost:8080

## 📱 Components

## 📱 Components

### 🌐 Web Application (tatakai-app)

A modern React web application built with Next.js, providing a responsive interface for anime streaming across desktop and mobile devices.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

**Key Features:**
- **Modern Framework**: Server-side rendering with Next.js 15
- **Type Safety**: Full TypeScript implementation
- **Responsive Design**: Tailwind CSS with mobile-first approach
- **Component Library**: Radix UI for accessible, unstyled components
- **Video Streaming**: HLS.js integration for adaptive streaming
- **State Management**: React hooks and context for state handling
- **Performance**: Optimized builds with Turbopack support

**Technology Stack:**
- Next.js 15 with App Router
- React 19 with Concurrent Features
- TypeScript for type safety
- Tailwind CSS for styling
- Radix UI components
- HLS.js for video playback
- Framer Motion for animations

**Development:**
```bash
cd tatakai-app
npm run dev          # Development server with Turbopack
npm run dev-no-turbo # Development server without Turbopack
npm run build        # Production build
npm run start        # Production server
npm run lint         # Lint code
```

[📖 Detailed Web App Documentation](tatakai-app/README.md)

### 🔧 Backend Server (tatakai-backend)

A robust Node.js backend server providing authentication, data management, and API proxy services with MongoDB integration.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Express](https://img.shields.io/badge/Express-4.18-lightgrey) ![MongoDB](https://img.shields.io/badge/MongoDB-4.4+-green)

**Key Features:**
- **Authentication**: JWT-based secure authentication system
- **Database**: MongoDB with Mongoose ODM for data modeling
- **Security**: Helmet for security headers, rate limiting, CORS
- **User Management**: Profiles, preferences, and account management
- **Watch Tracking**: Episode progress and completion tracking
- **Favorites**: Anime favorites with ratings and personal notes
- **API Integration**: Seamless integration with HiAnime and AniSkip APIs
- **Performance**: Response compression and optimized queries

**Core Services:**
- **User Authentication**: Registration, login, password management
- **Data Proxy**: Enhanced anime data from external APIs
- **Progress Tracking**: Watch history across devices
- **Recommendations**: Personalized anime recommendations
- **Content Management**: Favorites, ratings, and watchlists

**API Endpoints:**

| Endpoint | Method | Description |
|----------|---------|------------|
| `/api/auth/register` | POST | User registration |
| `/api/auth/login` | POST | User authentication |
| `/api/auth/me` | GET | Current user profile |
| `/api/user/profile` | GET/PUT | User profile management |
| `/api/anime/home` | GET | Homepage anime data |
| `/api/anime/search` | GET | Search anime with filters |
| `/api/anime/info/:id` | GET | Detailed anime information |
| `/api/watch-history` | GET/POST | Watch progress tracking |
| `/api/favorites` | GET/POST/DELETE | Favorites management |

**Development:**
```bash
cd tatakai-backend
npm run dev          # Development server with nodemon
npm start            # Production server
```

[📖 Detailed Backend Documentation](tatakai-backend/README.md) | [📚 API Reference](docs/backend.md)

### 📺 webOS TV Application (tatakai-webos-app)

A native webOS application optimized for smart TV viewing with advanced remote control navigation and TV-specific features.

![webOS](https://img.shields.io/badge/webOS-Native-purple) ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow) ![HLS.js](https://img.shields.io/badge/HLS.js-1.6+-red)

**Key Features:**
- **TV Optimization**: Interface designed specifically for 10-foot viewing
- **Remote Navigation**: Advanced spatial navigation with D-pad support
- **Platform Integration**: Native webOS APIs and services
- **Video Player**: Custom player with HLS streaming and quality selection
- **Performance**: Optimized for TV hardware with smooth animations
- **Accessibility**: TV-friendly fonts, colors, and navigation patterns

**Technical Highlights:**
- **Spatial Navigation**: 2D navigation grid for remote control
- **webOS Services**: Integration with TV-specific APIs
- **Custom Player**: HLS.js with TV-optimized controls
- **Asset Management**: Optimized icons and background images
- **Build System**: Vite for modern development workflow

**App Configuration:**
```json
{
  "id": "com.tatakai.animeapp",
  "title": "Tatakai - Anime Streaming", 
  "version": "1.0.0",
  "resolution": "1920x1080",
  "category": {
    "main": "Entertainment",
    "sub": "Video"
  }
}
```

**File Structure:**
```
tatakai-webos-app/
├── public/
│   ├── appinfo.json      # webOS app configuration
│   ├── index.html        # Main HTML file
│   ├── icon.png          # App icon (80x80)
│   └── bg.png            # Background image
├── js/
│   ├── api-client.js     # HiAnime API client
│   ├── webos-api.js      # webOS platform integration
│   ├── navigation.js     # Remote control navigation
│   ├── ui-manager.js     # UI state management
│   ├── video-player.js   # Video playback handling
│   └── app.js            # Main application entry point
├── css/
│   ├── style.css         # Base styles
│   └── tv-ui.css         # TV-specific UI optimizations
├── icons/                # SVG icons for navigation
└── package.json          # Dependencies and build scripts
```

**Development:**
```bash
cd tatakai-webos-app
npm run dev          # Development server with Vite
npm run build        # Build for production
npm run package      # Package for webOS (.ipk file)
npm run serve        # Local development server
```

**webOS Deployment:**
```bash
# Install webOS CLI tools globally
npm install -g @webosose/ares-cli

# Setup device connection
ares-setup-device

# Package the app
npm run package

# Install on webOS TV
ares-install com.tatakai.animeapp_1.0.0_all.ipk

# Launch the app
ares-launch com.tatakai.animeapp

# Check app status
ares-inspect com.tatakai.animeapp
```

[📖 Detailed webOS App Documentation](tatakai-webos-app/README.md)

## 🎨 Visual Assets

### Project Logo
![Tatakai Logo](logo.png)

The main Tatakai logo represents the platform's modern and dynamic approach to anime streaming.

### webOS TV Application Assets

**App Icon:**
![webOS App Icon](tatakai-webos-app/public/icon.png)

The webOS app uses a custom-designed icon optimized for TV interfaces with a gradient background and the distinctive "T" logo.

**Background Design:**
![webOS Background](tatakai-webos-app/public/bg.png)

The TV app features a sophisticated background with animated particles and gradient design optimized for large screen viewing.

### Screenshots

*Application screenshots will be displayed here once the applications are running*

#### Web Application Interface
- Modern, responsive design
- Clean anime browsing interface
- Video player with HLS streaming
- User authentication and profile management

#### webOS TV Interface  
- TV-optimized layout with large, readable elements
- Remote control navigation with spatial movement
- Full-screen video player with subtitle support
- Background blur effects for immersive viewing

## 🔧 Configuration

### Backend Environment Variables

Create a `.env` file in the `tatakai-backend` directory:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/tatakai-db
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
HIANIME_API_BASE_URL=https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime
ANISKIP_API_BASE_URL=https://api.aniskip.com/v2
```

### webOS App Configuration

The webOS app configuration is in `tatakai-webos-app/public/appinfo.json`:

```json
{
  "id": "com.tatakai.animeapp",
  "title": "Tatakai - Anime Streaming",
  "version": "1.0.0",
  "resolution": "1920x1080",
  "category": {
    "main": "Entertainment",
    "sub": "Video"
  }
}
```

## 📚 API Documentation

The platform integrates with external APIs for anime data:

### HiAnime API Integration

**Base URL**: `https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime`

Key endpoints:
- `/home` - Get featured and trending anime
- `/search?q={query}` - Search anime
- `/anime/{animeId}` - Get anime details
- `/anime/{animeId}/episodes` - Get episode list
- `/episode/sources` - Get video sources

### AniSkip API Integration

**Base URL**: `https://api.aniskip.com/v2`

- `/skip-times/{malId}/{episode}` - Get intro/outro skip times

[📚 Complete API Documentation](docs/backend.md)

## 🚀 Deployment

### Development Workflow

For local development of the complete platform:

1. **Start all services:**
   ```bash
   # Terminal 1: MongoDB
   mongod
   
   # Terminal 2: Backend API
   cd tatakai-backend && npm run dev
   
   # Terminal 3: Web App  
   cd tatakai-app && npm run dev
   
   # Terminal 4: webOS App (optional)
   cd tatakai-webos-app && npm run serve
   ```

2. **Verify services:**
   - Backend API: http://localhost:5000/health
   - Web Application: http://localhost:3000
   - webOS Application: http://localhost:8080

### Production Deployment

#### Web Application Deployment

**Vercel (Recommended):**
```bash
cd tatakai-app
npm run build
vercel --prod
```

**Docker Deployment:**
```bash
cd tatakai-app
docker build -t tatakai-app .
docker run -p 3000:3000 tatakai-app
```

**Environment Variables for Web App:**
```env
NEXT_PUBLIC_API_URL=https://your-backend-api.com
NEXT_PUBLIC_HIANIME_API=https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime
```

#### Backend Deployment

**Heroku Deployment:**
```bash
cd tatakai-backend
heroku create tatakai-backend
heroku addons:create mongolab
git push heroku main
```

**Railway Deployment:**
```bash
cd tatakai-backend
railway login
railway init
railway up
```

**Production Environment Setup:**
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/tatakai
JWT_SECRET=your-super-secure-secret-key-here
JWT_EXPIRE=7d
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

#### webOS App Deployment

**Development Deployment:**
```bash
cd tatakai-webos-app

# Build and package
npm run build
npm run package

# Install on webOS TV
ares-setup-device
ares-install com.tatakai.animeapp_1.0.0_all.ipk

# Launch and test
ares-launch com.tatakai.animeapp
```

**Store Submission:**
1. Create developer account at [webOS TV Developer](https://webostv.developer.lge.com/)
2. Package app for submission: `ares-package --check dist`
3. Submit through LG Seller Lounge
4. Pass content review and certification

### Docker Compose Setup

For complete environment setup:

```yaml
# docker-compose.yml
version: '3.8'
services:
  mongodb:
    image: mongo:4.4
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      
  backend:
    build: ./tatakai-backend
    ports:
      - "5000:5000"
    depends_on:
      - mongodb
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/tatakai
      
  frontend:
    build: ./tatakai-app
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  mongodb_data:
```

Run with: `docker-compose up -d`

## 🤝 Contributing

We welcome contributions to the Tatakai project! Here's how you can help improve the platform:

### Development Setup for Contributors

1. **Fork and Clone:**
   ```bash
   git clone https://github.com/your-username/Tatakai.git
   cd Tatakai
   ```

2. **Create Development Branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Set Up Development Environment:**
   ```bash
   # Install dependencies for all components
   cd tatakai-backend && npm install && cd ..
   cd tatakai-app && npm install && cd ..
   cd tatakai-webos-app && npm install && cd ..
   ```

4. **Start Development Services:**
   ```bash
   # Use the provided development script or start manually
   npm run dev:all  # If available, or start each service individually
   ```

### Contribution Guidelines

#### Code Style and Standards

**JavaScript/TypeScript:**
- Use ESLint and Prettier configurations provided
- Follow existing code patterns and naming conventions
- Add TypeScript types for new components and functions
- Include JSDoc comments for complex functions

**Component Structure:**
```typescript
// Example React component structure
interface ComponentProps {
  // Define prop types
}

export const Component: React.FC<ComponentProps> = ({ props }) => {
  // Component logic
  return (
    // JSX
  );
};
```

**Backend Code:**
```javascript
// Example API endpoint structure
const routeHandler = async (req, res) => {
  try {
    // Validation
    // Business logic
    // Response
  } catch (error) {
    // Error handling
  }
};
```

#### Testing Guidelines

**Backend Testing:**
```bash
cd tatakai-backend
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

**Frontend Testing:**
```bash
cd tatakai-app
npm test                   # Run Jest tests
npm run test:e2e          # End-to-end tests
```

#### Pull Request Process

1. **Before Starting:**
   - Check existing issues and PRs
   - Create an issue for new features
   - Discuss approach with maintainers

2. **Development:**
   - Write clean, documented code
   - Add tests for new functionality
   - Update documentation as needed
   - Follow commit message conventions

3. **Commit Messages:**
   ```
   type(scope): description
   
   feat(auth): add OAuth2 integration
   fix(video): resolve HLS playback issue  
   docs(api): update endpoint documentation
   refactor(ui): improve component structure
   ```

4. **Before Submitting:**
   ```bash
   # Lint all code
   npm run lint:all
   
   # Run tests
   npm run test:all
   
   # Build all components
   npm run build:all
   ```

5. **Submit Pull Request:**
   - Use descriptive title and description
   - Reference related issues
   - Include screenshots for UI changes
   - Request review from maintainers

### Types of Contributions

#### 🐛 Bug Fixes
- Fix existing functionality issues
- Improve error handling
- Resolve compatibility problems

#### ✨ New Features  
- Add new anime streaming features
- Improve user interface components
- Enhance webOS TV functionality
- Add new API integrations

#### 📚 Documentation
- Improve README files
- Add code comments
- Create tutorials and guides
- Update API documentation

#### 🎨 Design Improvements
- UI/UX enhancements
- Visual design updates
- Accessibility improvements
- Mobile responsiveness

#### ⚡ Performance
- Optimize loading times
- Improve video streaming performance
- Database query optimization
- Bundle size reduction

### Project Areas

**Frontend (tatakai-app):**
- React components and hooks
- UI/UX design and animations
- Video player improvements
- Mobile responsiveness
- Accessibility features

**Backend (tatakai-backend):**
- API endpoint development
- Database schema improvements
- Authentication and security
- Third-party integrations
- Performance optimization

**webOS App (tatakai-webos-app):**
- TV-specific UI components
- Remote control navigation
- webOS platform integration
- Video playback optimization
- Performance for TV hardware

### Community Guidelines

- **Be Respectful**: Treat all contributors with respect
- **Be Collaborative**: Work together to improve the project
- **Be Patient**: Code review and discussion take time
- **Be Helpful**: Assist other contributors when possible

### Recognition

Contributors will be recognized in:
- Project README contributors section
- Release notes for significant contributions
- Special mentions for outstanding contributions

### Getting Started Ideas

**Good First Issues:**
- Documentation improvements
- UI text updates
- Small bug fixes
- Adding unit tests
- Improving error messages

**Intermediate Tasks:**
- New UI components
- API endpoint improvements
- Performance optimizations
- Feature enhancements

**Advanced Tasks:**
- Architecture improvements
- New platform integrations
- Complex feature development
- Security enhancements

## 📄 License

This project is licensed under the MIT License - see the individual package.json files for details.

## 🙏 Acknowledgments

- [HiAnime API](https://aniwatch-api-taupe-eight.vercel.app/) for anime data
- [AniSkip API](https://api.aniskip.com/) for skip times
- [webOS Open Source Edition](https://webosose.org/) for TV platform
- All the amazing anime content creators

## 🐛 Troubleshooting

### Common Development Issues

#### Backend Issues

**1. MongoDB Connection Error**
```bash
Error: connect ECONNREFUSED 127.0.0.1:27017
```
*Solutions:*
- Ensure MongoDB is running: `sudo systemctl start mongod`
- Check connection string in `.env` file
- Verify MongoDB installation: `mongo --version`
- For MongoDB Atlas, check network access whitelist

**2. JWT Authentication Errors**
```bash
Error: JWT secret not provided
```
*Solutions:*
- Ensure `JWT_SECRET` is set in `.env` file
- Use a strong, random secret (minimum 32 characters)
- Restart backend server after changing `.env`

**3. CORS Issues**
```bash
Access-Control-Allow-Origin error
```
*Solutions:*
- Add frontend URL to `ALLOWED_ORIGINS` in backend `.env`
- Check that frontend and backend URLs match exactly
- Ensure backend is running before starting frontend

#### Frontend Issues

**4. API Connection Failures**
```bash
Failed to fetch from API endpoint
```
*Solutions:*
- Verify backend is running on correct port
- Check `NEXT_PUBLIC_API_URL` environment variable
- Ensure backend health endpoint responds: `curl http://localhost:5000/health`

**5. Build Failures**
```bash
Type error in build process
```
*Solutions:*
- Run `npm run lint` to check for TypeScript errors
- Update dependencies: `npm update`
- Clear Next.js cache: `rm -rf .next`

#### webOS App Issues

**6. App Not Installing on TV**
```bash
ares-install: command not found
```
*Solutions:*
- Install webOS CLI: `npm install -g @webosose/ares-cli`
- Setup device connection: `ares-setup-device`
- Check TV developer mode is enabled
- Verify device IP address and connection

**7. Remote Control Navigation Issues**
```bash
Navigation not working with TV remote
```
*Solutions:*
- Ensure spatial navigation is properly initialized
- Check focus management in `navigation.js`
- Test with webOS simulator first
- Verify event listeners are attached

**8. Video Playback Problems**
```bash
Video fails to load or play
```
*Solutions:*
- Check HLS.js library is loaded correctly
- Verify video source URLs are accessible
- Test with different video formats
- Check browser/webOS browser compatibility

### Platform-Specific Debugging

#### Development Tools

**Backend Debugging:**
```bash
# Enable debug logging
DEBUG=* npm run dev

# Check API endpoints
curl -X GET http://localhost:5000/api/anime/home

# Monitor database operations
mongod --verbose
```

**Frontend Debugging:**
```bash
# Enable verbose Next.js logging  
npm run dev --debug

# Build analysis
npm run build --analyze

# Check bundle size
npx next-bundle-analyzer
```

**webOS Debugging:**
```bash
# Remote debugging
ares-inspect com.tatakai.animeapp

# Check app logs
ares-log com.tatakai.animeapp

# Device information
ares-device-info
```

#### Performance Optimization

**Backend Performance:**
- Enable compression middleware
- Implement proper database indexing
- Use connection pooling for MongoDB
- Add Redis caching for frequently accessed data

**Frontend Performance:**
- Implement code splitting with Next.js
- Optimize images with next/image
- Use React.memo for expensive components
- Implement virtual scrolling for large lists

**webOS Performance:**
- Minimize DOM manipulations
- Use requestAnimationFrame for animations
- Implement lazy loading for content
- Optimize CSS for TV rendering

### Logs and Monitoring

#### Backend Logs
```bash
# Application logs
tail -f logs/app.log

# MongoDB logs  
tail -f /var/log/mongodb/mongod.log

# PM2 logs (if using PM2)
pm2 logs tatakai-backend
```

#### Frontend Logs
```bash
# Next.js logs
npm run dev 2>&1 | tee logs/frontend.log

# Browser console (check for JavaScript errors)
# Open browser DevTools > Console
```

#### webOS Logs
```bash
# Application logs
ares-log com.tatakai.animeapp

# System logs
ares-device-info --system-info
```

### Support and Community

**Getting Help:**
- 🐛 [Create an Issue](https://github.com/Snozxyx/Tatakai/issues/new)
- 📖 Check component-specific README files
- 📚 Review API documentation in `/docs`
- 🔧 Test with provided example configurations

**Before Reporting Issues:**
1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Provide system information (OS, Node.js version, etc.)
4. Include relevant log output
5. Describe steps to reproduce the problem

**Development Resources:**
- [Next.js Documentation](https://nextjs.org/docs)
- [webOS TV Developer Guide](https://webostv.developer.lge.com/develop)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [HLS.js Documentation](https://github.com/video-dev/hls.js/)

---

**Tatakai** - Bringing anime streaming to every screen 🎌✨