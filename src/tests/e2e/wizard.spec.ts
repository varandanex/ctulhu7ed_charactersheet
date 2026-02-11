import { test, expect } from "@playwright/test";

test("home page loads and can enter wizard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Creador de Investigadores")).toBeVisible();
  await page.getByRole("button", { name: "Empezar creacion" }).click();
  await expect(page).toHaveURL(/\/crear\/1/);
});
