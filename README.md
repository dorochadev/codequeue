# <img src="assets/codequeue-logo.png" width="128" height="128" align="center" /> CodeQueue

**Turn your code comments into tracked work.**

CodeQueue automatically syncs your `// TODO` comments to your GitHub Project board. Stay in the flow of coding while ensuring every task is captured, tracked, and organized.

---

## Features

- **🔄 Auto-Sync**: Automatically detects `// TODO` comments in your code and creates Draft Issues in GitHub Projects.
- **📍 Smart Linking**: Tracks tasks by file and content. Moving code around won't duplicate tasks.
- **🗑️ Auto-Archive**: Deleting a `TODO` comment automatically archives the corresponding item in your project.
- **🏷️ Custom Status**: Configure which column new tasks should land in (e.g., "Todo", "Backlog", "In Progress").
- **👥 Multi-Project**: Easily switch between different project boards.

## Setup

1.  **Install CodeQueue** from the VS Code Marketplace.
2.  **Set GitHub Token**:
    - Click the `$(alert) CodeQueue: No Token` status bar item.
    - Or run command: `CodeQueue: Set GitHub Token`.
    - _Note: Requires a Classic Personal Access Token (PAT) with `project` and `repo` scopes._
3.  **Connect Project**:
    - Click the `$(alert) CodeQueue: No Project ID` status bar item.
    - Select your GitHub Project from the list.
4.  **Set Default Status** (Optional):
    - Run `CodeQueue: Set Default Status` to choose where new tasks appear.

## Usage

Just write comments as you normally would:

```typescript
// TODO: Refactor the authentication service
// TODO(bug): Fix the race condition in the scanner
```

CodeQueue handles the rest.

- A spinner `$(sync~spin)` in the status bar indicates when sync is in progress.
- Check the "CodeQueue" Output channel for detailed logs.

## Requirements

- VS Code `^1.104.0`
- A GitHub Project (V2)

## Roadmap

We are planning to expand CodeQueue to support more Kanban and project management tools in the future:

- [ ] Linear
- [ ] Notion
- [ ] ClickUp
- [ ] Trello

## Contributing

Contributions are welcome! If you're interested in adding support for one of the platforms above or have other improvements in mind, please feel free to open a Pull Request or Issue.

## License

[MIT](LICENSE)
