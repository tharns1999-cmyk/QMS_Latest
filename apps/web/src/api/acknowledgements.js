import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiGet, apiPost } from './client';

const nameOf = (users, id) => users.find((u) => u.id === id)?.name || id;

// Acknowledgements ride along with the DARs: the person asked gets an inbox task, and each confirmation is a timeline event.
// A failed read must not stop the DAR list from loading.
export const loadAcknowledgements = async () => {
  const rows = (await apiGet('/api/acknowledgements').catch(() => ({}))).acknowledgements || [];
  const me = useStore.getState().currentUser;
  return {
    tasks: () => rows.filter((a) => a.status === 'PENDING' && a.user_id === me?.id).map((a) => ({
      id: `api-ack-${a.id}`,
      acknowledgementId: a.id,
      darId: String(a.dar_id),
      documentId: a.document_id,
      docId: a.document_id,
      referenceType: 'INTERNAL_DAR',
      referenceId: String(a.dar_id),
      docCode: a.doc_code,
      doc_code: a.doc_code,
      docTitle: a.doc_name,
      docName: a.doc_name,
      title: `[รับทราบเอกสาร] ${a.doc_name} (${a.doc_code})`,
      type: 'Ack',
      taskType: 'ACKNOWLEDGE',
      assigneeId: a.user_id,
      assignee_id: a.user_id,
      requesterId: a.requester_id,
      department: a.department,
      status: 'PENDING',
      createdAt: a.created_at
    })),
    timeline: (users) => rows.filter((a) => a.status === 'ACKNOWLEDGED').map((a) => ({
      id: Date.parse(a.acknowledged_at) + a.id,
      darId: String(a.dar_id),
      action: 'Acknowledged',
      user: nameOf(users, a.user_id),
      date: a.acknowledged_at.slice(0, 16).replace('T', ' ')
    }))
  };
};

// Returns true once the server has recorded it; otherwise shows the reason.
export const acknowledgeOnApi = async (acknowledgementId) => {
  let done = true;
  try {
    await apiPost(`/api/acknowledgements/${acknowledgementId}/acknowledge`);
  } catch (err) {
    toast.error(err.message);
    done = false;
  }
  const { loadDars } = await import('./dars');
  await loadDars().catch(() => {});
  return done;
};
