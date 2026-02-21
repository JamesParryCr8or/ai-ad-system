# How to Embed the Quiz Funnel

You can drop the quiz into your landing page using one of these two methods:

### Method 1: iFrame (Recommended for separate file)
Add this to your `landing-page` file where you want the quiz to appear:

```html
<iframe src="quiz-funnel.html" width="100%" height="800px" frameborder="0"></iframe>
```

### Method 2: Direct Code Paste
Open `quiz-funnel.html`, copy everything inside the `<body>` tag and the `<style>` tag, and paste it into your `landing-page`.

### Method 3: AI Arsenal Component
To showcase the full "Growth Arsenal" of AI models:
```html
<iframe src="ai-arsenal-component.html" width="100%" height="800px" frameborder="0" style="border-radius: 24px;"></iframe>
```
Alternatively, copy the `<style>` and `<section>` from `ai-arsenal-component.html` directly into your main layout.

## Configuration
To update the webhook, search for this line in `quiz-funnel.html`:
```javascript
await fetch('https://hook.placeholder.com/your-endpoint', ...
```
And replace the URL with your webhook address.
