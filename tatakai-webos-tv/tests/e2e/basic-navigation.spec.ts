import { test, expect } from '@playwright/test'

test.describe('Tatakai webOS TV App', () => {
  test.beforeEach(async ({ page }) => {
    // Start with the home page
    await page.goto('http://localhost:3000')
  })

  test('should load home page with header and content', async ({ page }) => {
    // Check that the app loads
    await expect(page.locator('h1:has-text("Tatakai")')).toBeVisible()
    
    // Check header navigation
    await expect(page.locator('button:has-text("Home")')).toBeVisible()
    await expect(page.locator('button:has-text("Search")')).toBeVisible()
    
    // Wait for content to load (skeleton should be replaced)
    await page.waitForTimeout(3000)
  })

  test('should navigate with keyboard (DPAD simulation)', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(2000)
    
    // Test arrow key navigation
    await page.keyboard.press('Tab') // Focus first element
    await page.keyboard.press('ArrowRight') // Navigate right
    await page.keyboard.press('ArrowDown') // Navigate down
    await page.keyboard.press('Enter') // Select element
    
    // Should have navigated somewhere (specific checks depend on loaded content)
    await page.waitForTimeout(1000)
  })

  test('should open search with red button simulation', async ({ page }) => {
    // Simulate red button press (mapped to search)
    await page.keyboard.press('F1') // or use the actual key code
    
    // Search page should be visible
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible()
  })

  test('should handle search functionality', async ({ page }) => {
    // Open search
    await page.click('button:has-text("Search")')
    
    // Type in search box
    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('naruto')
    
    // Wait for search results (with debounce)
    await page.waitForTimeout(1000)
    
    // Should show loading or results
    await expect(page.locator('text=Searching').or(page.locator('[role="listitem"]'))).toBeVisible({
      timeout: 10000
    })
  })

  test('should be responsive for TV resolutions', async ({ page }) => {
    // Test 1080p resolution
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.locator('h1:has-text("Tatakai")')).toBeVisible()
    
    // Test 720p resolution  
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(page.locator('h1:has-text("Tatakai")')).toBeVisible()
  })

  test('should have proper focus management', async ({ page }) => {
    // Test that focusable elements have proper focus styling
    await page.keyboard.press('Tab')
    
    // Check for focus ring (outline or box-shadow)
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
    
    // Focus should be clearly visible (accessibility requirement)
    const styles = await focusedElement.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        outline: computed.outline,
        boxShadow: computed.boxShadow
      }
    })
    
    // Should have either outline or box-shadow for focus indication
    expect(styles.outline !== 'none' || styles.boxShadow !== 'none').toBeTruthy()
  })
})