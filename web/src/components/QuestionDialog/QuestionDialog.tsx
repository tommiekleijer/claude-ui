import { MessageCircleQuestion, MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { answerQuestion, useStore } from '../../store';
import { Chip, Knop } from '../../vertex';
import Dialog from '../ui/Dialog';
import styles from './QuestionDialog.module.scss';

const OTHER = '__other__';

const QuestionDialog = () => {
  const request = useStore((s) => s.questions[0]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);

  useEffect(() => {
    setSelected({});
    setOther({});
    setStep(0);
  }, [request?.id]);

  if (!request) {
    return null;
  }

  const toggle = (question: string, label: string, multi: boolean) =>
    setSelected((s) => {
      const current = s[question] ?? [];
      if (!multi) {
        return { ...s, [question]: [label] };
      }
      return { ...s, [question]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label] };
    });

  const answerFor = (question: string) =>
    (selected[question] ?? [])
      .map((label) => (label === OTHER ? other[question]?.trim() ?? '' : label))
      .filter(Boolean)
      .join(', ');

  const complete = request.questions.every((q) => answerFor(q.question));
  const total = request.questions.length;
  const isLast = step === total - 1;
  const current = request.questions[step];
  const currentAnswered = Boolean(answerFor(current.question));

  const submit = () => {
    if (complete) {
      answerQuestion(request.id, Object.fromEntries(request.questions.map((q) => [q.question, answerFor(q.question)])));
    }
  };

  // Volgende vraag, of versturen bij de laatste.
  const next = () => {
    if (!currentAnswered) {
      return;
    }
    if (isLast) {
      submit();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <Dialog
      scoped
      title={
        <>
          <MessageCircleQuestion size={20} className={styles.icon} />
          Claude heeft een vraag
          {total > 1 && (
            <span className={styles.progress}>
              {request.questions.map((q, index) => (
                <button
                  key={q.question}
                  type="button"
                  className={[styles.step, index === step && styles.stepActive, answerFor(q.question) && styles.stepDone]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setStep(index)}
                  aria-label={`Vraag ${index + 1}: ${q.header}`}
                  title={q.header}
                />
              ))}
              <span>
                {step + 1} van {total}
              </span>
            </span>
          )}
        </>
      }
      footer={
        <>
          <Knop variant="tertiair" maat="s" onClick={() => answerQuestion(request.id, null)}>
            Overslaan
          </Knop>
          <Knop variant="tertiair" maat="s" icoon={<MessageSquareText size={14} />} onClick={() => answerQuestion(request.id, null, true)}>
            Chat hierover
          </Knop>
          <span className={styles.spacer} />
          {step > 0 && (
            <Knop maat="s" onClick={() => setStep((s) => s - 1)}>
              Vorige
            </Knop>
          )}
          <Knop variant="primair" maat="s" onClick={next} disabled={!currentAnswered || (isLast && !complete)}>
            {isLast ? 'Versturen' : 'Volgende'}
          </Knop>
        </>
      }
    >
      <div className={styles.questions}>
        {[current].map((q) => {
          const chosen = selected[q.question] ?? [];
          return (
            <fieldset key={q.question} className={styles.question}>
              <legend>
                <Chip toon="accent">{q.header}</Chip>
                <span className={styles.questionText}>{q.question}</span>
                {q.multiSelect && <span className={styles.multi}>meerdere mogelijk</span>}
              </legend>
              {q.options.map((option, index) => (
                <label key={option.label} className={chosen.includes(option.label) ? `${styles.option} ${styles.chosen}` : styles.option}>
                  <input
                    type={q.multiSelect ? 'checkbox' : 'radio'}
                    name={q.question}
                    checked={chosen.includes(option.label)}
                    onChange={() => toggle(q.question, option.label, q.multiSelect)}
                    autoFocus={index === 0}
                  />
                  <span className={styles.optionText}>
                    <span className={styles.label}>{option.label}</span>
                    {option.description && <span className={styles.description}>{option.description}</span>}
                    {option.preview && chosen.includes(option.label) && <pre className={styles.preview}>{option.preview}</pre>}
                  </span>
                </label>
              ))}
              <label className={chosen.includes(OTHER) ? `${styles.option} ${styles.chosen}` : styles.option}>
                <input
                  type={q.multiSelect ? 'checkbox' : 'radio'}
                  name={q.question}
                  checked={chosen.includes(OTHER)}
                  onChange={() => toggle(q.question, OTHER, q.multiSelect)}
                />
                <span className={styles.optionText}>
                  <span className={styles.label}>Anders</span>
                  <input
                    className={styles.other}
                    placeholder="Typ je eigen antwoord"
                    value={other[q.question] ?? ''}
                    onFocus={() => !chosen.includes(OTHER) && toggle(q.question, OTHER, q.multiSelect)}
                    onChange={(event) => setOther((o) => ({ ...o, [q.question]: event.target.value }))}
                    onKeyDown={(event) => event.key === 'Enter' && next()}
                  />
                </span>
              </label>
            </fieldset>
          );
        })}
      </div>
    </Dialog>
  );
};

export default QuestionDialog;
