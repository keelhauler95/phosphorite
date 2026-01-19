import React, { useState, useMemo, useEffect } from 'react';
import Prompt from '../Prompt';
import Teletype from '../Teletype';
import './style.scss';

interface ComposeMessageProps {
  onSend: (recipients: string[], subject: string, body: string) => void;
  onCancel: () => void;
  initialRecipients?: string[];
  initialSubject?: string;
}

type ComposeStep = 'recipients_prompt' | 'recipients_input' | 'subject_prompt' | 'subject_input' | 'body_prompt' | 'body_input' | 'confirm_prompt' | 'confirm_input';

const ComposeMessage: React.FC<ComposeMessageProps> = ({ onSend, onCancel, initialRecipients, initialSubject }) => {
  const normalizedRecipients = useMemo(() => {
    if (!initialRecipients || initialRecipients.length === 0) {
      return [];
    }
    return initialRecipients
      .map((recipient) => recipient.trim())
      .filter(Boolean);
  }, [initialRecipients]);

  const normalizedSubject = useMemo(() => (initialSubject ? initialSubject.trim() : ''), [initialSubject]);

  const initialStep = useMemo<ComposeStep>(() => {
    if (normalizedRecipients.length === 0) {
      return 'recipients_prompt';
    }
    if (!normalizedSubject) {
      return 'subject_prompt';
    }
    return 'body_prompt';
  }, [normalizedRecipients, normalizedSubject]);

  const [step, setStep] = useState<ComposeStep>(initialStep);
  const [recipients, setRecipients] = useState<string[]>(normalizedRecipients);
  const [subject, setSubject] = useState(normalizedSubject);
  const [body, setBody] = useState('');

  useEffect(() => {
    setRecipients(normalizedRecipients);
  }, [normalizedRecipients]);

  useEffect(() => {
    setSubject(normalizedSubject);
  }, [normalizedSubject]);

  useEffect(() => {
    setStep(initialStep);
    setBody('');
  }, [initialStep]);

  const handleTeletypeComplete = () => {
    if (step === 'recipients_prompt') {
      setStep('recipients_input');
    } else if (step === 'subject_prompt') {
      setStep('subject_input');
    } else if (step === 'body_prompt') {
      setStep('body_input');
    } else if (step === 'confirm_prompt') {
      setStep('confirm_input');
    }
  };

  const handleRecipientsSubmit = (value: string) => {
    // Parse comma-separated list
    const recipientList = value.split(',').map(r => r.trim()).filter(r => r.length > 0);
    if (recipientList.length === 0) {
      alert('Please enter at least one recipient');
      return;
    }
    setRecipients(recipientList);
    setStep('subject_prompt');
  };

  const handleSubjectSubmit = (value: string) => {
    if (value.length === 0) {
      alert('Subject cannot be empty');
      return;
    }
    if (value.length > 48) {
      alert('Subject must be 48 characters or less');
      return;
    }
    setSubject(value);
    setStep('body_prompt');
  };

  const handleBodySubmit = (value: string) => {
    if (value.length === 0) {
      alert('Message body cannot be empty');
      return;
    }
    setBody(value);
    setStep('confirm_prompt');
  };

  const handleConfirm = (value: string) => {
    const answer = value.toLowerCase().trim();
    if (answer === 'y' || answer === 'yes') {
      onSend(recipients, subject, body);
    } else if (answer === 'n' || answer === 'no') {
      onCancel();
    }
  };

  return (
    <div className="compose-message">
      {step === 'recipients_prompt' && (
        <Teletype 
          text="To: " 
          speed={60}
          onComplete={handleTeletypeComplete}
        />
      )}

      {step === 'recipients_input' && (
        <div className="compose-prompt-line">
          <span>To: </span>
          <Prompt
            prompt=""
            onSubmit={handleRecipientsSubmit}
            autoFocus={true}
          />
        </div>
      )}

      {step === 'subject_prompt' && (
        <div>
          <div className="compose-static-line">To: {recipients.join(', ')}</div>
          <Teletype 
            text="Subject: " 
            speed={60}
            onComplete={handleTeletypeComplete}
          />
        </div>
      )}

      {step === 'subject_input' && (
        <div>
          <div className="compose-static-line">To: {recipients.join(', ')}</div>
          <div className="compose-prompt-line">
            <span>Subject: </span>
            <Prompt
              prompt=""
              onSubmit={handleSubjectSubmit}
              autoFocus={true}
            />
          </div>
        </div>
      )}

      {step === 'body_prompt' && (
        <div>
          <div className="compose-static-line">To: {recipients.join(', ')}</div>
          <div className="compose-static-line">Subject: {subject}</div>
          <Teletype 
            text="Body: " 
            speed={60}
            onComplete={handleTeletypeComplete}
          />
        </div>
      )}

      {step === 'body_input' && (
        <div>
          <div className="compose-static-line">To: {recipients.join(', ')}</div>
          <div className="compose-static-line">Subject: {subject}</div>
          <div className="compose-prompt-line">
            <span>Body: </span>
            <Prompt
              prompt=""
              onSubmit={handleBodySubmit}
              autoFocus={true}
            />
          </div>
        </div>
      )}

      {step === 'confirm_prompt' && (
        <div>
          <div className="compose-static-line">To: {recipients.join(', ')}</div>
          <div className="compose-static-line">Subject: {subject}</div>
          <div className="compose-static-line">Body: {body}</div>
          <br />
          <Teletype 
            text="Send? (y/n): " 
            speed={60}
            onComplete={handleTeletypeComplete}
          />
        </div>
      )}

      {step === 'confirm_input' && (
        <div>
          <div className="compose-static-line">To: {recipients.join(', ')}</div>
          <div className="compose-static-line">Subject: {subject}</div>
          <div className="compose-static-line">Body: {body}</div>
          <br />
          <div className="compose-prompt-line">
            <span>Send? (y/n): </span>
            <Prompt
              prompt=""
              onSubmit={handleConfirm}
              autoFocus={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ComposeMessage;
