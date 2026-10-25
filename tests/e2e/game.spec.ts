import { test, expect } from "@playwright/test";
test("daily docket persists answers and produces spoiler-free results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Play today's docket/ }).click();
  for (let i = 0; i < 5; i++) {
    await expect(page.locator(".options button")).toHaveCount(4);
    await page.locator(".options button").first().click();
    await expect(page.locator(".feedback")).toBeVisible();
    await expect(page.locator(".options button").first()).toBeDisabled();
    if (i < 4)
      await page.getByRole("button", { name: /Next question/ }).click();
  }
  await page.reload();
  await page.getByRole("button", { name: /Resume today's docket/ }).click();
  await expect(page.locator(".options button").first()).toBeDisabled();
  await page.getByRole("button", { name: /See my verdict/ }).click();
  await expect(page.locator(".results")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy result" })).toBeVisible();
  await page.getByText("Plain-text share card", { exact: true }).click();
  const share = await page.locator("pre").innerText();
  expect(share).toContain("Objectle! #");
  expect(share).not.toMatch(/Hearsay|FRE|Relevance/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /View today’s verdict/ }),
  ).toBeVisible();
  await expect(page.locator(".countdown")).toContainText("Next docket:");
});
test("mobile home supports theme and legal information", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Court is in session/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.locator("blockquote")).toContainText("Not legal advice");
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`court and complete question fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /Play today's docket/ }).click();
    const check = async () => {
      for (const selector of [
        ".case-context",
        ".court svg",
        ".record",
        ".options",
      ]) {
        const box = await page.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      }
      expect(
        await page
          .locator("main")
          .evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    };
    for (let i = 0; i < 5; i++) {
      await check();
      await page.locator(".options button").first().click();
      await expect(page.locator(".feedback")).toBeVisible();
      await check();
      const f = await page.locator(".feedback").boundingBox();
      expect(f!.y + f!.height).toBeLessThanOrEqual(viewport.height);
      if (i === 0)
        await page.screenshot({
          path: `test-results/court-${viewport.width}.png`,
        });
      if (i < 4)
        await page.getByRole("button", { name: /Next question/ }).click();
    }
  });
}
test("October bonus archive is available immediately and separate from daily stats", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Play today's docket/ }),
  ).toBeEnabled();
  const before = await page.request.get("/api/stats").then((r) => r.json());
  await page.getByRole("button", { name: "Case files", exact: true }).click();
  await expect(page.locator(".archive-grid button")).toHaveCount(31);
  await page
    .getByRole("button", { name: "Play bonus docket October 31", exact: true })
    .click();
  await expect(page.locator(".case-meta")).toContainText(
    "OCTOBER BONUS ARCHIVE",
  );
  for (let i = 0; i < 5; i++) {
    await page.locator(".options button").first().click();
    await page
      .getByRole("button", {
        name: i === 4 ? /See my verdict/ : /Next question/,
      })
      .click();
  }
  await expect(page.locator(".results")).toBeVisible();
  const after = await page.request.get("/api/stats").then((r) => r.json());
  expect(after.streak).toBe(before.streak);
  expect(after.careerCorrect).toBe(before.careerCorrect);
});

test('longest available bonus case fits the phone courtroom', async ({ page }) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const files=fs.readdirSync('content/bonus-archive').filter(f=>f.endsWith('.json') && f!=='schedule.json');
  const entries=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join('content/bonus-archive',f),'utf8')));
  const score=(q:any)=>q.setting.length+q.transcript.reduce((n:number,l:any)=>n+l.text.length,0)+q.explanation.length+q.trap_note.length;
  const longest=entries.sort((a:any,b:any)=>score(b)-score(a))[0];
  const schedule=JSON.parse(fs.readFileSync('content/bonus-archive/schedule.json','utf8'));
  const found=Object.entries(schedule).find(([,ids])=>(ids as string[]).includes(longest.id));
  expect(found).toBeDefined();
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByRole('button',{name:/Play today's docket/})).toBeEnabled();
  await page.getByRole('button',{name:'Case files',exact:true}).click();
  await page.getByRole('button',{name:`Play bonus docket October ${Number(found![0].slice(-2))}`,exact:true}).click();
  const index=(found![1] as string[]).indexOf(longest.id);
  for(let i=0;i<index;i++){await page.locator('.options button').first().click();await page.getByRole('button',{name:/Next question/}).click();}
  for(const selector of ['.case-context','.court','.record','.options']){
    const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();expect(box!.y+box!.height).toBeLessThanOrEqual(844);
  }
  expect(await page.locator('main').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
  await page.locator('.options button').first().click();await expect(page.locator('.feedback')).toBeVisible();
  expect(await page.locator('main').evaluate(e=>e.scrollHeight<=e.clientHeight+1)).toBe(true);
  await page.screenshot({path:'test-results/court-longest-bonus-mobile.png'});
});
