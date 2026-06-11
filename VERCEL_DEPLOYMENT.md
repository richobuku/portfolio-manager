# Vercel Deployment Guide for Portfolio Manager Frontend

This guide will help you deploy your React frontend to Vercel.

## Prerequisites

1. A GitHub account with your code pushed to a repository
2. A Vercel account (free tier available)
3. Your backend API deployed separately (e.g., on Render or Heroku)

## Step 1: Prepare Your Repository

Make sure your code is pushed to GitHub with the following structure:
```
portfolio-manager/
├── frontend/
│   ├── package.json
│   ├── public/
│   └── src/
├── vercel.json
├── package.json
└── .vercelignore
```

## Step 2: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from your project root:
   ```bash
   vercel
   ```

4. Follow the prompts:
   - Set up and deploy? `Y`
   - Which scope? Choose your account
   - Link to existing project? `N`
   - What's your project's name? `portfolio-manager`
   - In which directory is your code located? `./frontend`

### Option B: Using Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Create React App
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`

## Step 3: Configure Environment Variables

In your Vercel project settings, add these environment variables:

### Required Variables:
- `REACT_APP_API_URL`: Your backend API URL (e.g., `https://your-backend.onrender.com`)

### Optional Variables:
- `REACT_APP_ENVIRONMENT`: `production`

## Step 4: Update Configuration

The `vercel.json` file is already configured for your project structure. It will:
- Build the React app from the `frontend` directory
- Serve the built files from `frontend/build`
- Handle routing for your React app

## Step 5: Test Your Deployment

1. Visit your Vercel URL: `https://your-project-name.vercel.app`
2. Test the login functionality
3. Verify API calls to your backend
4. Check that all routes work correctly

## Troubleshooting

### Common Issues:

1. **Build Failures**:
   - Check the build logs in Vercel dashboard
   - Ensure all dependencies are in `frontend/package.json`
   - Verify Node.js version compatibility

2. **API Connection Issues**:
   - Verify `REACT_APP_API_URL` is correctly set
   - Check CORS settings on your backend
   - Ensure your backend is accessible from Vercel

3. **Routing Issues**:
   - The `vercel.json` includes proper routing configuration
   - All routes should redirect to your React app

4. **Environment Variables**:
   - Make sure all `REACT_APP_*` variables are set in Vercel
   - Variables must be prefixed with `REACT_APP_` to be accessible in React

### Useful Commands:

```bash
# Test build locally
cd frontend && npm run build

# Deploy to Vercel
vercel

# Deploy to production
vercel --prod

# Check deployment status
vercel ls
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend API URL | `https://your-backend.onrender.com` |
| `REACT_APP_ENVIRONMENT` | Environment | `production` |

## Security Considerations

1. **API URLs**: Use HTTPS URLs for your backend API
2. **CORS**: Configure your backend to allow requests from your Vercel domain
3. **Environment Variables**: Never commit sensitive data to your repository
4. **HTTPS**: Vercel automatically provides HTTPS for all deployments

## Performance Optimizations

1. **Build Optimization**: Vercel automatically optimizes your React build
2. **CDN**: Vercel uses a global CDN for fast content delivery
3. **Caching**: Static assets are automatically cached
4. **Image Optimization**: Consider using Vercel's image optimization features

## Monitoring and Maintenance

1. **Analytics**: Enable Vercel Analytics to monitor performance
2. **Logs**: Check function logs in the Vercel dashboard
3. **Updates**: Vercel automatically redeploys on git push
4. **Custom Domain**: Add a custom domain in project settings

## Cost Optimization

- **Free Tier**: Includes 100GB bandwidth and unlimited deployments
- **Pro Tier**: $20/month for additional features and higher limits
- **Team Tier**: $20/user/month for team collaboration

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [React Deployment Guide](https://create-react-app.dev/docs/deployment/)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
