# Change Log

All notable changes to the "codequeue" extension will be documented in this file.

## [1.1.0] - 2026-02-08

### Added

- **Workspace-scoped settings**: Configure different Trello boards, GitHub projects, or Apple Reminders lists per workspace
  - Authentication (API keys, tokens) remains global (user-wide)
  - Board/list/project selections are now workspace-specific (saved in `.vscode/settings.json`)
  - Seamless fallback to global settings when workspace settings are not configured

### Improved

- **Enhanced Trello authentication flow**:
  - Added comprehensive debug logging for credential storage and retrieval
  - Improved error messages with specific guidance for 401 Unauthorized errors
  - Clarified token generation instructions (Token vs Secret)
  - Reduced authentication delays from 2000ms to 500ms for faster setup
- **Better status bar UX**:
  - Color-coded status indicators:
    - 🔴 Red: Authentication required
    - 🟠 Orange: Workspace needs board/project configuration
    - ⚪ White: Fully configured and ready
  - Smart click behavior: directs users to authentication or workspace setup as needed
  - Status bar color now updates immediately after successful configuration

### Fixed

- Status bar color not updating after successful Trello setup (stayed red until reload)
- Trello token storage timing issues causing authentication failures
- Workspace-specific board selection now properly prompts users in new workspaces

## [1.0.0] - Initial Release

- Initial release with GitHub Projects, Trello, and Apple Reminders support
