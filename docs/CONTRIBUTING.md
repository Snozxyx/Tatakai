# Contributing to Tatakai Mobile

Thank you for your interest in contributing to Tatakai Mobile! This document provides guidelines and instructions for contributing.

## 🤝 How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Screenshots** (if applicable)
- **Device information** (OS, version, model)
- **App version**

Example:
```markdown
## Bug: Video player crashes on seek

**Steps to Reproduce:**
1. Open anime detail page
2. Start playing episode
3. Seek forward 2 minutes
4. App crashes

**Expected:** Video should skip forward smoothly
**Actual:** App crashes with error

**Device:** iPhone 14 Pro, iOS 17.1
**App Version:** 1.0.0 (build 1)
```

### Suggesting Features

Feature requests are welcome! Please include:

- **Clear description** of the feature
- **Use case**: Why is this feature needed?
- **Mockups or examples** (if UI-related)
- **Alternatives considered**

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Write/update tests**
5. **Ensure code follows style guide**
6. **Commit your changes** (`git commit -m 'Add amazing feature'`)
7. **Push to branch** (`git push origin feature/amazing-feature`)
8. **Open a Pull Request**

## 📝 Development Setup

### Prerequisites
- Flutter SDK 3.0.0+
- Dart SDK 3.0.0+
- Git
- IDE (VS Code or Android Studio)

### Initial Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/tatakai-mobile.git
cd tatakai-mobile

# Add upstream remote
git remote add upstream https://github.com/tatakai/tatakai-mobile.git

# Install dependencies
flutter pub get

# Generate code
flutter pub run build_runner build --delete-conflicting-outputs

# Run app
flutter run
```

### Keeping Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## 💻 Code Style Guide

### Dart Code Style

We follow the official [Dart style guide](https://dart.dev/guides/language/effective-dart/style).

#### Key Points:

1. **Naming Conventions**
   ```dart
   // Classes: PascalCase
   class AnimeCard {}
   
   // Variables, functions: camelCase
   String animeName = 'Naruto';
   void fetchAnimeData() {}
   
   // Constants: lowerCamelCase
   const apiBaseUrl = 'https://...';
   
   // Private members: _underscore prefix
   String _privateField;
   void _privateMethod() {}
   ```

2. **File Organization**
   ```dart
   // 1. Imports (organized by package)
   import 'dart:async';
   
   import 'package:flutter/material.dart';
   import 'package:hooks_riverpod/hooks_riverpod.dart';
   
   import 'package:tatakai_mobile/models/anime.dart';
   import 'package:tatakai_mobile/services/api_service.dart';
   
   // 2. Constants
   const kAnimationDuration = Duration(milliseconds: 300);
   
   // 3. Classes
   class MyWidget extends StatelessWidget {}
   ```

3. **Documentation**
   ```dart
   /// Fetches anime information from the API.
   ///
   /// Returns [AnimeInfo] containing all anime details including
   /// episodes, characters, and recommendations.
   ///
   /// Throws [ApiException] if the request fails.
   Future<AnimeInfo> fetchAnimeInfo(String animeId) async {
     // Implementation
   }
   ```

4. **Error Handling**
   ```dart
   // Always handle errors explicitly
   try {
     final data = await api.fetchHome();
     return data;
   } on ApiException catch (e) {
     print('API error: ${e.message}');
     rethrow;
   } catch (e) {
     print('Unexpected error: $e');
     throw ApiException('Failed to fetch home data');
   }
   ```

5. **Async/Await**
   ```dart
   // Prefer async/await over .then()
   // Good
   Future<void> loadData() async {
     final data = await api.fetchData();
     setState(() => _data = data);
   }
   
   // Avoid
   Future<void> loadData() {
     return api.fetchData().then((data) {
       setState(() => _data = data);
     });
   }
   ```

### Widget Guidelines

1. **Composition over Inheritance**
   ```dart
   // Good: Compose smaller widgets
   class AnimeCard extends StatelessWidget {
     @override
     Widget build(BuildContext context) {
       return Card(
         child: Column(
           children: [
             AnimeImage(imageUrl),
             AnimeTitle(title),
             AnimeMetadata(metadata),
           ],
         ),
       );
     }
   }
   ```

2. **Extract Reusable Widgets**
   ```dart
   // If a widget tree is used multiple times, extract it
   Widget _buildSection(String title, List<Anime> items) {
     return Column(
       children: [
         SectionHeader(title),
         HorizontalAnimeList(items),
       ],
     );
   }
   ```

3. **Use Const Constructors**
   ```dart
   // Good: Improves performance
   const Text('Hello')
   const SizedBox(height: 16)
   const Icon(Icons.favorite)
   
   // Bad: Unnecessary rebuilds
   Text('Hello')
   SizedBox(height: 16)
   Icon(Icons.favorite)
   ```

### State Management (Riverpod)

1. **Provider Organization**
   ```dart
   // Group related providers in same file
   // lib/providers/anime_providers.dart
   
   final animeListProvider = StateNotifierProvider<AnimeListNotifier, AnimeListState>((ref) {
     return AnimeListNotifier(ref.read(apiServiceProvider));
   });
   
   final animeDetailProvider = FutureProvider.family<AnimeInfo, String>((ref, animeId) {
     return ref.read(apiServiceProvider).fetchAnimeInfo(animeId);
   });
   ```

2. **Provider Naming**
   ```dart
   // State providers: noun + Provider
   final authProvider = StateProvider<AuthState>(...);
   final userProfileProvider = StateProvider<UserProfile>(...);
   
   // Future providers: verb + Provider
   final fetchHomeDataProvider = FutureProvider<HomeData>(...);
   final searchAnimesProvider = FutureProvider.family<SearchResult, String>(...);
   ```

## 🧪 Testing

### Writing Tests

1. **Unit Tests** (`test/`)
   ```dart
   // test/models/anime_test.dart
   void main() {
     group('Anime', () {
       test('fromJson creates valid Anime', () {
         final json = {'id': '1', 'name': 'Naruto', ...};
         final anime = Anime.fromJson(json);
         
         expect(anime.id, '1');
         expect(anime.name, 'Naruto');
       });
       
       test('toJson creates valid JSON', () {
         final anime = Anime(id: '1', name: 'Naruto', ...);
         final json = anime.toJson();
         
         expect(json['id'], '1');
         expect(json['name'], 'Naruto');
       });
     });
   }
   ```

2. **Widget Tests** (`test/widgets/`)
   ```dart
   // test/widgets/anime_card_test.dart
   void main() {
     testWidgets('AnimeCard displays anime info', (tester) async {
       final anime = Anime(id: '1', name: 'Naruto', ...);
       
       await tester.pumpWidget(
         MaterialApp(
           home: AnimeCard(anime: anime),
         ),
       );
       
       expect(find.text('Naruto'), findsOneWidget);
       expect(find.byType(Image), findsOneWidget);
     });
     
     testWidgets('AnimeCard navigates on tap', (tester) async {
       await tester.pumpWidget(TestApp());
       await tester.tap(find.byType(AnimeCard));
       await tester.pumpAndSettle();
       
       expect(find.byType(AnimeDetailScreen), findsOneWidget);
     });
   }
   ```

3. **Integration Tests** (`integration_test/`)
   ```dart
   // integration_test/app_test.dart
   void main() {
     testWidgets('Complete user flow', (tester) async {
       await tester.pumpWidget(TatakaiApp());
       
       // Login
       await tester.tap(find.text('Login'));
       await tester.enterText(find.byType(TextField).first, 'test@email.com');
       await tester.enterText(find.byType(TextField).last, 'password');
       await tester.tap(find.text('Sign In'));
       await tester.pumpAndSettle();
       
       // Search anime
       await tester.tap(find.byIcon(Icons.search));
       await tester.enterText(find.byType(TextField), 'Naruto');
       await tester.pumpAndSettle();
       
       // Tap result
       await tester.tap(find.text('Naruto').first);
       await tester.pumpAndSettle();
       
       // Verify anime detail page
       expect(find.byType(AnimeDetailScreen), findsOneWidget);
     });
   }
   ```

### Running Tests

```bash
# Run all tests
flutter test

# Run specific test file
flutter test test/models/anime_test.dart

# Run with coverage
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html

# Run integration tests
flutter test integration_test/
```

## 📁 Project Structure

When adding new features, follow this structure:

```
lib/
├── models/          # Add new data models here
│   └── my_model.dart
├── providers/       # Add new providers here
│   └── my_provider.dart
├── services/        # Add new services here
│   └── my_service.dart
├── screens/         # Add new screens here
│   └── my_feature/
│       ├── my_screen.dart
│       └── widgets/
│           └── my_widget.dart
└── widgets/         # Add reusable widgets here
    ├── common/
    │   └── my_widget.dart
    └── layout/
        └── my_layout.dart
```

## 🔍 Code Review Process

### Before Submitting PR

- [ ] Code follows style guide
- [ ] All tests pass
- [ ] No linting errors (`flutter analyze`)
- [ ] Code is documented
- [ ] Screenshots for UI changes
- [ ] Performance tested (no jank)

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Widget tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
Before/after screenshots

## Checklist
- [ ] Code follows style guide
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
```

## 🎨 UI/UX Guidelines

### Design Principles
1. **Consistency**: Use existing components
2. **Simplicity**: Keep interfaces clean
3. **Feedback**: Provide clear user feedback
4. **Performance**: 60 FPS, smooth animations
5. **Accessibility**: Consider all users

### Adding New Screens

```dart
class NewScreen extends ConsumerStatefulWidget {
  const NewScreen({super.key});
  
  @override
  ConsumerState<NewScreen> createState() => _NewScreenState();
}

class _NewScreenState extends ConsumerState<NewScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Screen')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Your widgets here
            ],
          ),
        ),
      ),
    );
  }
}
```

## 🐛 Debugging Tips

### Common Issues

1. **Hot Reload Not Working**
   ```bash
   # Stop app and rebuild
   flutter clean
   flutter pub get
   flutter run
   ```

2. **Dependency Issues**
   ```bash
   # Clear pub cache
   flutter pub cache repair
   flutter pub get
   ```

3. **Build Failures**
   ```bash
   # iOS
   cd ios && rm -rf Pods Podfile.lock && pod install && cd ..
   
   # Android
   cd android && ./gradlew clean && cd ..
   ```

### Debugging Tools

```dart
// Print statements
print('Debug: $variable');
debugPrint('Debug message');

// Breakpoints in VS Code/Android Studio
// Click line number to add breakpoint

// Flutter DevTools
// Run app then:
flutter pub global activate devtools
flutter pub global run devtools

// Inspect widget tree
// Add to any widget:
debugDumpApp();

// Performance overlay
MaterialApp(
  showPerformanceOverlay: true,
  ...
)
```

## 📚 Additional Resources

- [Flutter Documentation](https://flutter.dev/docs)
- [Dart Language Tour](https://dart.dev/guides/language/language-tour)
- [Riverpod Documentation](https://riverpod.dev)
- [Material Design Guidelines](https://material.io/design)
- [iOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

## 💬 Communication

- **GitHub Issues**: Bug reports and feature requests
- **Pull Requests**: Code contributions
- **Discord**: Real-time chat (coming soon)
- **Email**: snozxyx@gabhasti.tech
## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Tatakai! 🎉
