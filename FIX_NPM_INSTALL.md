# Fix npm install "Invalid Version" Error

## Problem
Vercel deployment fails at `npm install` with "Invalid Version" error.

## Root Cause
The issue is likely caused by:
1. Empty lines in `package.json` that npm 10.x may be stricter about
2. Corrupted or outdated `package-lock.json` with invalid version references
3. npm cache issues

## Solution

### Step 1: Clean package.json (DONE)
Removed empty lines between dependencies to ensure clean formatting.

### Step 2: Reproduce locally with Node 20

```bash
# Ensure you're using Node 20.x
node --version  # Should show v20.x.x

# Navigate to project directory
cd /Users/sachamoyne/Desktop/Projects/Soma

# Remove existing artifacts
rm -rf node_modules package-lock.json

# Clean npm cache
npm cache clean --force

# Install dependencies (this will regenerate package-lock.json)
npm install --verbose
```

### Step 3: Verify installation

```bash
# Check for any errors
npm list --depth=0

# Verify package-lock.json was created
ls -la package-lock.json
```

### Step 4: Commit changes

```bash
# Add the cleaned package.json and new package-lock.json
git add package.json package-lock.json
git commit -m "fix: clean package.json formatting and regenerate package-lock.json for npm 10.x compatibility"
```

## What Changed

### package.json
- Removed empty lines between dependency groups
- All dependencies remain the same, only formatting changed
- All version strings are valid semver ranges

### package-lock.json
- Will be regenerated with npm 10.x
- Will contain valid version references for all dependencies
- Will be compatible with Node 20.x

## Verification

After running `npm install`, verify:
1. No "Invalid Version" errors
2. `package-lock.json` exists and is valid JSON
3. `node_modules` directory is created successfully
4. Build succeeds: `npm run build`

## If Problem Persists

If the error persists after these steps, check:

1. **Specific package causing issue**:
   ```bash
   npm install --verbose 2>&1 | grep -i "invalid version"
   ```

2. **Check for problematic dependencies**:
   ```bash
   npm ls --all | grep -i "invalid\|error"
   ```

3. **Verify npm version**:
   ```bash
   npm --version  # Should be 10.x for Vercel compatibility
   ```

## Notes

- The `package.json` has been cleaned to remove formatting issues
- All version strings are valid semver (e.g., `^1.1.2`, `^17.7.0`)
- No dependencies were changed, only formatting
- The `package-lock.json` will be regenerated with correct versions
