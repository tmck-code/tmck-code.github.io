# 20250102 OSX dark mode shortcut

> Update 20250924: As of the release of macOS Tahoe, you can also use the new "Shortcuts" app to achieve this!
> These shortcuts can't be assigned to keyboard shortcuts yet, but you can run them via Spotlight.

- [20250102 OSX dark mode shortcut](#20250102-osx-dark-mode-shortcut)
  - [Automator](#automator)
    - [1. Launch Automator](#1-launch-automator)
    - [2. Create "Quick Action"](#2-create-quick-action)
    - [3. Search for "appearance"](#3-search-for-appearance)
    - [4. Drag "Change System Appearance" to the workflow](#4-drag-change-system-appearance-to-the-workflow)
    - [5. Save the Quick Action](#5-save-the-quick-action)
    - [6. Assign a Keyboard Shortcut](#6-assign-a-keyboard-shortcut)
  - [Shortcuts](#shortcuts)
    - [1. Launch Shortcuts](#1-launch-shortcuts)
    - [2. Add a new shortcut](#2-add-a-new-shortcut)
    - [3. Create the shortcut logic](#3-create-the-shortcut-logic)
    - [4. Use via Spotlight](#4-use-via-spotlight)

---

## Automator

*Using the power of OSX Automator!*

<img src="https://github.com/user-attachments/assets/3c1aaaf4-6159-4573-81dd-40022f571f29" style="width: 20%">

> Automator offers many handy actions in OSX. After creating an "automation" in Automator, you can save it as a "Quick Action" and assign a keyboard shortcut to it in System Preferences.

*Documentation: https://support.apple.com/en-au/guide/automator/welcome/mac*



---

### 1. Launch Automator

![launch](https://github.com/user-attachments/assets/ffad91c7-2419-4b88-8d63-14b3b0fb7aad)

### 2. Create "Quick Action"

![create](https://github.com/user-attachments/assets/2d7ba1a6-2f29-4af0-b290-7efe938314c4)

### 3. Search for "appearance"

![search](https://github.com/user-attachments/assets/e3525979-1605-4055-91b6-6487d8e62e0c)

### 4. Drag "Change System Appearance" to the workflow

![configure](https://github.com/user-attachments/assets/f15f4e2f-fccd-4975-b625-7e895d86790d)

If you like, you can click "Run" in the top-right corner to test the action.

### 5. Save the Quick Action

![save](https://github.com/user-attachments/assets/9064cde7-fb26-4edf-9a34-61399110d4c1)

### 6. Assign a Keyboard Shortcut

Open `System Preferences` > `Keyboard` > `Shortcuts` > `Services` > `General` and assign a keyboard shortcut to the Quick Action.

![shortcut](https://github.com/user-attachments/assets/63749d21-c33c-457d-94a6-6df095f1937e)

Done! Enjoy your new shortcut 🤓🙈

---

## Shortcuts

### 1. Launch Shortcuts

![launch](https://github.com/user-attachments/assets/e1a00f72-c083-4004-ad20-7e90048f17b6)

### 2. Add a new shortcut

![add](https://github.com/user-attachments/assets/857cd51e-14de-4d5d-80dc-1e43589cda95)

### 3. Create the shortcut logic

![logic](https://github.com/user-attachments/assets/37902654-5c74-4c63-bb17-b8dfd0a5204c)
> Now you can just close the window to save your shortcut!

### 4. Use via Spotlight

Despite the name, it doesn't seem like it's currently possible to assign a keyboard shortcut to a shortcut created in the Shortcuts app.

Instead, you can run it via Spotlight (Cmd + Space) by typing the name of the shortcut. This can be made easier by "adding quick keys" to the Spotlight search, in this example I've chosen the letter `"t"`

![spotlight](https://github.com/user-attachments/assets/7acdb570-e0d6-4b9e-83b2-11043c79b6b0)
