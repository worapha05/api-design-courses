/**
 * Mock upstream Order service (internal API)
 */
import express from 'express';

const app = express();
app.use(express.json());

app.get('/orders', (req, res) => {
  res.json({
    data: [
      { id: 'ord_1', status: 'pending', total: 100 },
      { id: 'ord_2', status: 'paid', total: 250 },
    ],
    meta: {
      requestedBy: req.header('x-user-id') ?? null,
      requestId: req.header('x-request-id') ?? null,
      note: 'internal service — expects X-User-Id from gateway',
    },
  });
});

app.get('/orders/:id', (req, res) => {
  res.json({
    id: req.params.id,
    status: 'pending',
    requestedBy: req.header('x-user-id'),
  });
});

app.listen(5001, () => console.log('Upstream Order service on :5001'));
