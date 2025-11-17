import express from 'express';
import adminAuthRoutes from './admin/auth.js';
import adminUsersRoutes from './admin/users.js';
import adminTemplatesRoutes from './admin/templates.js';
import adminCreatorsRoutes from './admin/creators.js';
import adminTransactionsRoutes from './admin/transactions.js';
import adminAnalyticsRoutes from './admin/analytics.js';
import adminSettingsRoutes from './admin/settings.js';
import adminSupportRoutes from './admin/support.js';
import adminUploadRoutes from './admin/upload.js';
import adminAIConfigRoutes from './admin/aiConfig.js';
import adminDiagnosticsRoutes from './admin/diagnostics.js';

const router = express.Router();

router.use('/auth', adminAuthRoutes);
router.use('/users', adminUsersRoutes);
router.use('/templates', adminTemplatesRoutes);
router.use('/creators', adminCreatorsRoutes);
router.use('/transactions', adminTransactionsRoutes);
router.use('/analytics', adminAnalyticsRoutes);
router.use('/settings', adminSettingsRoutes);
router.use('/support', adminSupportRoutes);
router.use('/upload', adminUploadRoutes);
router.use('/ai-config', adminAIConfigRoutes);
router.use('/diagnostics', adminDiagnosticsRoutes);

export default router;

