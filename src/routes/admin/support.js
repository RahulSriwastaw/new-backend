import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Mock support tickets data
const mockTickets = [
  {
    id: 'TKT-001',
    subject: 'User unable to generate images',
    user: 'John Doe',
    userEmail: 'john@example.com',
    date: '2023-06-15',
    priority: 'high',
    status: 'open',
    messages: [
      {
        id: 'MSG-001',
        sender: 'John Doe',
        message: 'I am unable to generate images. The process gets stuck at 50%.',
        timestamp: '2023-06-15T10:30:00Z',
        isCustomer: true
      }
    ]
  },
  {
    id: 'TKT-002',
    subject: 'Payment gateway not working',
    user: 'Jane Smith',
    userEmail: 'jane@example.com',
    date: '2023-06-14',
    priority: 'urgent',
    status: 'in-progress',
    assignedTo: 'Admin User',
    messages: [
      {
        id: 'MSG-002',
        sender: 'Jane Smith',
        message: 'Payment through Razorpay is failing with an error message.',
        timestamp: '2023-06-14T14:20:00Z',
        isCustomer: true
      },
      {
        id: 'MSG-003',
        sender: 'Admin User',
        message: 'We are investigating this issue. Please try again in a few hours.',
        timestamp: '2023-06-14T15:45:00Z',
        isCustomer: false
      }
    ]
  },
  {
    id: 'TKT-003',
    subject: 'Template approval request',
    user: 'Creator Studio',
    userEmail: 'creator@example.com',
    date: '2023-06-13',
    priority: 'medium',
    status: 'resolved',
    messages: [
      {
        id: 'MSG-004',
        sender: 'Creator Studio',
        message: 'Please review my template submission for approval.',
        timestamp: '2023-06-13T09:15:00Z',
        isCustomer: true
      }
    ]
  }
];

// Get all support tickets with optional filtering
router.get('/', (req, res) => {
  try {
    const { status, priority } = req.query;
    let filteredTickets = [...mockTickets];
    
    if (status) {
      filteredTickets = filteredTickets.filter(ticket => ticket.status === status);
    }
    
    if (priority) {
      filteredTickets = filteredTickets.filter(ticket => ticket.priority === priority);
    }
    
    res.json(filteredTickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific support ticket
router.get('/:id', (req, res) => {
  try {
    const ticket = mockTickets.find(t => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reply to support ticket
router.post('/:id/reply', (req, res) => {
  try {
    const { message } = req.body;
    const ticket = mockTickets.find(t => t.id === req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const newMessage = {
      id: `MSG-${Date.now()}`,
      sender: 'Admin User',
      message: message,
      timestamp: new Date().toISOString(),
      isCustomer: false
    };
    
    ticket.messages.push(newMessage);
    ticket.status = 'in-progress';
    
    res.json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close support ticket
router.post('/:id/close', (req, res) => {
  try {
    const ticket = mockTickets.find(t => t.id === req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    ticket.status = 'closed';
    
    res.json({ success: true, message: 'Ticket closed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign ticket to admin
router.post('/:id/assign', (req, res) => {
  try {
    const { adminId } = req.body;
    const ticket = mockTickets.find(t => t.id === req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    if (!adminId) {
      return res.status(400).json({ error: 'Admin ID is required' });
    }
    
    ticket.assignedTo = adminId;
    ticket.status = 'in-progress';
    
    res.json({ success: true, message: 'Ticket assigned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;