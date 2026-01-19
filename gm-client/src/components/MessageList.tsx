import { useState, useMemo } from 'react';
import { Message } from '../types';

interface Props {
  messages: Message[];
  onEdit: (message: Message) => void;
  onDelete: (id: string) => void;
}

type SortField = 'sender' | 'subject' | 'recipients' | 'read' | 'time';
type SortOrder = 'asc' | 'desc';

function MessageList({ messages, onEdit, onDelete }: Props) {
  const [filterSender, setFilterSender] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterRecipients, setFilterRecipients] = useState('');
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const parseGameTime = (timeStr: string): string => {
    try {
      const time = JSON.parse(timeStr);
      const hourStr = String(time.hour).padStart(2, '0');
      const minStr = String(time.minute).padStart(2, '0');
      const secStr = String(time.second).padStart(2, '0');
      return `E${time.era} D${time.day} ${hourStr}:${minStr}:${secStr}`;
    } catch {
      return timeStr;
    }
  };

  const getGameTimeValue = (timeStr: string): number => {
    try {
      const time = JSON.parse(timeStr);
      // Convert to a comparable number: era * 1000000 + day * 100000 + hour * 3600 + minute * 60 + second
      return time.era * 1000000 + time.day * 100000 + time.hour * 3600 + time.minute * 60 + time.second;
    } catch {
      return 0;
    }
  };

  const getReadCount = (message: Message): string => {
    const totalRecipients = message.recipients.length;
    const readCount = Object.values(message.read_status).filter(read => read).length;
    return `${readCount}/${totalRecipients}`;
  };

  const getReadPercentage = (message: Message): number => {
    const totalRecipients = message.recipients.length;
    if (totalRecipients === 0) return 0;
    const readCount = Object.values(message.read_status).filter(read => read).length;
    return readCount / totalRecipients;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle order if clicking the same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to ascending for new field
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: SortField): string => {
    if (sortField !== field) return '⇅';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const filteredAndSortedMessages = useMemo(() => {
    // Filter
    let filtered = messages.filter(message => {
      const senderMatch = !filterSender || message.sender.toLowerCase().includes(filterSender.toLowerCase());
      const subjectMatch = !filterSubject || message.subject.toLowerCase().includes(filterSubject.toLowerCase());
      const recipientsMatch = !filterRecipients || message.recipients.some(r => 
        r.toLowerCase().includes(filterRecipients.toLowerCase())
      );
      
      return senderMatch && subjectMatch && recipientsMatch;
    });

    // Sort
    filtered.sort((a, b) => {
      let compareValue = 0;

      switch (sortField) {
        case 'sender':
          compareValue = a.sender.localeCompare(b.sender);
          break;
        case 'subject':
          compareValue = a.subject.localeCompare(b.subject);
          break;
        case 'recipients':
          compareValue = a.recipients.join(',').localeCompare(b.recipients.join(','));
          break;
        case 'read':
          compareValue = getReadPercentage(a) - getReadPercentage(b);
          break;
        case 'time':
          compareValue = getGameTimeValue(a.sent_at) - getGameTimeValue(b.sent_at);
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [messages, filterSender, filterSubject, filterRecipients, sortField, sortOrder]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent row click when clicking delete
    onDelete(id);
  };

  return (
    <div className="list">
      <div className="list-controls">
        <span className="list-count">
          {filteredAndSortedMessages.length} of {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>
              <div className="column-header">
                <span onClick={() => handleSort('sender')} className="sortable-label">
                  Sender {getSortIcon('sender')}
                </span>
                <input
                  type="text"
                  placeholder="Filter sender..."
                  value={filterSender}
                  onChange={(e) => setFilterSender(e.target.value)}
                  className="column-filter"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </th>
            <th>
              <div className="column-header">
                <span onClick={() => handleSort('subject')} className="sortable-label">
                  Subject {getSortIcon('subject')}
                </span>
                <input
                  type="text"
                  placeholder="Filter subject..."
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="column-filter"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </th>
            <th>
              <div className="column-header">
                <span onClick={() => handleSort('recipients')} className="sortable-label">
                  Recipients {getSortIcon('recipients')}
                </span>
                <input
                  type="text"
                  placeholder="Filter recipients..."
                  value={filterRecipients}
                  onChange={(e) => setFilterRecipients(e.target.value)}
                  className="column-filter"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </th>
            <th onClick={() => handleSort('read')} className="sortable-header">
              Read {getSortIcon('read')}
            </th>
            <th onClick={() => handleSort('time')} className="sortable-header">
              Sent At {getSortIcon('time')}
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedMessages.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-table-message">
                {(filterSender || filterSubject || filterRecipients) 
                  ? 'No messages match your filters.' 
                  : messages.length === 0
                    ? 'No messages yet. Create one to get started!'
                    : 'No messages to display.'}
              </td>
            </tr>
          ) : (
            filteredAndSortedMessages.map(message => (
              <tr 
                key={message.id}
                onClick={() => onEdit(message)}
                className="clickable-row"
              >
                <td>{message.sender}</td>
                <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {message.subject}
                </td>
                <td>
                  <span style={{ fontSize: '0.9em', color: 'var(--color-text-muted)' }}>
                    {message.recipients.join(', ')}
                  </span>
                </td>
                <td>{getReadCount(message)}</td>
                <td style={{ fontSize: '0.85em' }}>{parseGameTime(message.sent_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button 
                    onClick={(e) => handleDelete(e, message.id)}
                    className="delete-btn-table"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default MessageList;
