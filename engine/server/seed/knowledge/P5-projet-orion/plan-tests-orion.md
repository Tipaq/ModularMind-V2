# Plan de Tests — Projet Orion

## Stratégie

Le projet Orion nécessite des tests sur une grande variété de devices et de conditions réseau. L'accent est mis sur la fiabilité du streaming, le mode offline, et les notifications push.

## Parc de Devices

### iOS

| Device | OS | Usage |
|--------|----|----|
| iPhone 15 Pro | iOS 17 | Device principal dev |
| iPhone 13 | iOS 16 | Min supported version |
| iPhone SE 3 | iOS 17 | Petit écran (4.7") |
| iPad Air M2 | iPadOS 17 | Tablette |
| iPhone 12 | iOS 17 | Performances moyennes |

### Android

| Device | OS | Usage |
|--------|----|----|
| Pixel 8 | Android 14 | Device principal dev |
| Samsung Galaxy S23 | Android 14 | One UI (skin Samsung) |
| Samsung Galaxy A14 | Android 13 | Bas de gamme (test perf) |
| Redmi Note 12 | Android 13 | MIUI (skin Xiaomi) |
| Pixel 6a | Android 12 | Min supported version |

## 1. Tests Unitaires (Jest)

### Couverture Cible : 75%

| Module | Tests | Status |
|--------|-------|--------|
| SSE parser | 15 | ⬜ |
| Offline sync manager | 12 | ⬜ |
| Auth store (Zustand) | 10 | ⬜ |
| Conversations store | 12 | ⬜ |
| Message formatting | 8 | ⬜ |
| Push notification handler | 10 | ⬜ |
| Biometric auth flow | 8 | ⬜ |
| Storage (MMKV) wrappers | 6 | ⬜ |

## 2. Tests de Composants (React Native Testing Library)

| Composant | Tests | Status |
|-----------|-------|--------|
| MessageBubble (texte, markdown, code) | 12 | ⬜ |
| MessageInput (envoi, caractères spéciaux) | 8 | ⬜ |
| ConversationCard (preview, badge) | 6 | ⬜ |
| ConversationList (scroll, recherche) | 8 | ⬜ |
| StreamingText (animation, completion) | 6 | ⬜ |
| TypingIndicator | 3 | ⬜ |
| LoginScreen (validation, biométrie) | 8 | ⬜ |
| SettingsScreen (preferences, logout) | 5 | ⬜ |

## 3. Tests E2E (Detox)

### Parcours Critiques

| # | Parcours | Priorité | iOS | Android |
|---|----------|----------|-----|---------|
| E01 | Login email/password → voir conversations | P0 | ⬜ | ⬜ |
| E02 | Login biométrique | P0 | ⬜ | ⬜ |
| E03 | Ouvrir conversation → envoyer message → recevoir streaming | P0 | ⬜ | ⬜ |
| E04 | Créer nouvelle conversation | P0 | ⬜ | ⬜ |
| E05 | Rechercher dans les conversations | P1 | ⬜ | ⬜ |
| E06 | Mode hors ligne → consultation historique | P0 | ⬜ | ⬜ |
| E07 | Mode hors ligne → brouillon → reconnexion → envoi | P0 | ⬜ | ⬜ |
| E08 | Notification push → tap → ouvre la bonne conversation | P0 | ⬜ | ⬜ |
| E09 | Basculer thème clair/sombre | P2 | ⬜ | ⬜ |
| E10 | Modifier préférences notifications | P1 | ⬜ | ⬜ |
| E11 | Pull-to-refresh conversations | P1 | ⬜ | ⬜ |
| E12 | Scroll infini messages (100+ messages) | P1 | ⬜ | ⬜ |

### Configuration Detox

```javascript
// .detoxrc.js
module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' } },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/ModularMind.app',
      build: 'xcodebuild -workspace ios/ModularMind.xcworkspace ...',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 15' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_8' } },
  },
};
```

## 4. Tests de Performance

| Test | Seuil | Outil |
|------|-------|-------|
| Cold start (time to interactive) | < 1.5s | Flipper / Perf Monitor |
| Hot start | < 500ms | Flipper |
| App size (IPA/APK) | < 30 MB | EAS Build output |
| Memory usage (idle) | < 100 MB | Xcode Instruments / Android Profiler |
| Memory usage (100 messages) | < 200 MB | Profiler |
| Streaming FPS | > 55 FPS | Flipper / Perf Monitor |
| Scroll FPS (200 messages) | > 55 FPS | Flipper |
| Offline DB query (100 conversations) | < 50ms | Custom benchmark |

### Tests de Réseau

| Condition | Test |
|-----------|------|
| WiFi stable | Baseline — toutes fonctionnalités normales |
| 4G | Streaming fluide, latence < 2s |
| 3G lent | Streaming OK avec buffer, UI responsive |
| Mode avion | Offline mode activé, historique accessible |
| Perte connexion mid-stream | Reconnexion auto, message complet |
| WiFi → 4G (handoff) | Pas d'interruption visible |

## 5. Tests de Notifications Push

| Test | iOS | Android |
|------|-----|---------|
| Réception en foreground | Alerte in-app | Alerte in-app |
| Réception en background | Notification système | Notification système |
| Réception app fermée | Notification système | Notification système |
| Tap → ouvre conversation | Deep link fonctionnel | Deep link fonctionnel |
| Badge count correct | Badge sur icon app | Badge sur icon app |
| Quiet hours | Pas de notif entre 22h-7h | Pas de notif entre 22h-7h |
| Préférences désactivées | Pas de notif | Pas de notif |
| Token refresh | Nouveau token envoyé au backend | Nouveau token envoyé |

## 6. Tests de Sécurité

| Test | Description |
|------|-------------|
| Token stocké en SecureStore | Pas en AsyncStorage ou MMKV |
| Biométrie bypass | Impossible de contourner sans biométrie |
| Certificate pinning | Rejet des certificats inconnus |
| Jailbreak/root detection | Warning affiché, app fonctionnelle |
| Screenshot protection | Pas de restriction (contenu non sensible) |
| Data en transit | TLS 1.3 enforced |
| SQLite encryption | Données offline chiffrées (SQLCipher) |

## 7. Tests d'Accessibilité

| Test | Description |
|------|-------------|
| VoiceOver (iOS) | Navigation complète sans écran |
| TalkBack (Android) | Navigation complète sans écran |
| Font scaling (200%) | Layout préservé, texte lisible |
| Dark mode | Contraste WCAG AA respecté |
| Reduced motion | Animations désactivées |
| Minimum touch target | 44x44 points (iOS) / 48x48 dp (Android) |

## Environnements

| Env | Backend | Build |
|-----|---------|-------|
| Dev | localhost (Expo Go) | Development client |
| CI | Mock API (MSW) | EAS Build (preview) |
| Staging | staging.modularmind.io | EAS Build (preview) |
| Production | api.modularmind.io | EAS Build (production) |

## Critères de Release

L'app est prête pour soumission quand :

1. ✅ 0 crash dans les 48h de beta testing (100 users)
2. ✅ Tous les tests E2E P0 passent sur iOS + Android
3. ✅ Performance dans les seuils (TTI, FPS, mémoire)
4. ✅ Accessibilité VoiceOver/TalkBack validée
5. ✅ Notifications push fonctionnelles sur les 10 devices
6. ✅ Mode offline testé (perte connexion, reconnexion, sync)
7. ✅ Review Apple guidelines + Google Play policies
