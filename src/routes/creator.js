import express from 'express';

const router = express.Router();

router.get('/earnings', async (req, res) => {
  try {
    res.json({
      totalEarnings: 12840.55,
      thisMonthEarnings: 980.10,
      lastMonthEarnings: 855.00,
      pendingWithdrawal: 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const { amount, method, bankDetails, upiId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (method === 'upi' && !upiId) {
      return res.status(400).json({ error: 'UPI ID required' });
    }

    if (method === 'bank' && !bankDetails) {
      return res.status(400).json({ error: 'Bank details required' });
    }

    const withdrawalRequest = {
      id: `withdrawal_${Date.now()}`,
      creatorId: 'creator_123',
      amount,
      method,
      bankDetails: method === 'bank' ? bankDetails : undefined,
      upiId: method === 'upi' ? upiId : undefined,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      withdrawalRequest,
      message: 'Withdrawal request submitted successfully',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

