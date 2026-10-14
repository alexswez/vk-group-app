// Экран-форма материала: загрузка файла в общее хранилище или добавление ссылки.

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Div,
  FormItem,
  Group,
  Header,
  Input,
  NavIdProps,
  Panel,
  PanelHeader,
  Textarea,
} from '@vkontakte/vkui';
import { Icon28AttachOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

import { PATHS } from '../routes';
import { useAppData } from '../store/useAppData';
import { supportsFileUpload } from '../storage/api';
import { formatFileSize } from '../utils/format';

export const MaterialForm = ({ nav }: NavIdProps) => {
  const { subjects, materials, editingMaterialId, addMaterial, updateMaterial, startMaterialEditing } = useAppData();
  const routeNavigator = useRouteNavigator();

  const editingMaterial = editingMaterialId
    ? materials.find((material) => material.id === editingMaterialId)
    : undefined;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * Какой материал уже загружен в форму.
   *
   * Зачем: форма должна заполняться РОВНО ОДИН раз при открытии. Раньше эффект зависел
   * ещё и от списка предметов, а он обновляется при каждом чтении данных из облака —
   * из-за этого форма сбрасывалась и выбранный файл исчезал ещё до нажатия «Сохранить».
   */
  const loadedMaterialId = useRef<string | null | undefined>(undefined);
  /** Синхронный флажок сохранения: состояние React не успевает обновиться при быстрых нажатиях. */
  const savingRef = useRef(false);

  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  /** true, пока идёт сохранение (включая загрузку файла) — защита от повторного нажатия. */
  const [saving, setSaving] = useState(false);

  const canUploadFiles = supportsFileUpload();

  useEffect(() => {
    const loadedKey = editingMaterial ? editingMaterial.id : null;
    // Этот материал уже загружен в форму — повторно её не заполняем и файл не сбрасываем.
    if (loadedMaterialId.current === loadedKey) return;
    loadedMaterialId.current = loadedKey;

    if (editingMaterial) {
      setSubjectId(editingMaterial.subjectId);
      setTitle(editingMaterial.title);
      setDescription(editingMaterial.description);
      setLink(editingMaterial.link ?? '');
    } else {
      setSubjectId('');
      setTitle('');
      setDescription('');
      setLink('');
    }
    setFile(undefined);
    setError(null);
  }, [editingMaterial]);

  // Предмет по умолчанию подставляем отдельным эффектом: список предметов приходит
  // из облака не сразу, но сбрасывать из-за этого уже выбранный файл нельзя.
  useEffect(() => {
    if (!editingMaterial && !subjectId && subjects.length > 0) {
      setSubjectId(subjects[0].id);
    }
  }, [subjects, editingMaterial, subjectId]);

  const handleSave = async () => {
    // Защита от повторного нажатия: файл может загружаться несколько секунд.
    if (savingRef.current) return;

    if (title.trim().length < 3) {
      setError('Название материала должно быть не короче 3 символов.');
      return;
    }
    if (!subjectId) {
      setError('Выберите предмет.');
      return;
    }
    // В локальном режиме файлы не поддерживаются — просим ссылку, чтобы материал был полезен.
    if (!canUploadFiles && !editingMaterial && !file && link.trim().length === 0) {
      setError('В этом режиме файлы недоступны: добавьте ссылку на материал или описание.');
      return;
    }

    const payload = { subjectId, title, description, link: link.trim() || undefined, file };

    savingRef.current = true;
    setSaving(true);
    try {
      if (editingMaterial) {
        await updateMaterial(editingMaterial.id, payload);
      } else {
        await addMaterial(payload);
      }

      startMaterialEditing(null);
      routeNavigator.push(PATHS.MATERIALS);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Panel nav={nav}>
      <PanelHeader>{editingMaterial ? 'Изменить материал' : 'Новый материал'}</PanelHeader>

      <Group header={<Header size="s">Предмет</Header>}>
        <Div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {subjects.map((subject) => (
            <Button
              key={subject.id}
              size="s"
              mode={subjectId === subject.id ? 'primary' : 'secondary'}
              onClick={() => setSubjectId(subject.id)}
            >
              {subject.short}
            </Button>
          ))}
        </Div>
      </Group>

      <Group header={<Header size="s">Описание материала</Header>}>
        <FormItem top="Название">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например: Методичка по нормализации БД"
          />
        </FormItem>

        <FormItem top="Комментарий">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Что внутри, для какой темы, чем полезно"
            rows={3}
          />
        </FormItem>
      </Group>

      <Group header={<Header size="s">Файл или ссылка</Header>}>
        {canUploadFiles ? (
          <>
            {/* Скрытое поле выбора файла: открываем его кнопкой, чтобы вид был в стиле ВКонтакте. */}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              // Сбрасываем значение после выбора: иначе тот же файл нельзя выбрать повторно.
              onClick={(event) => {
                event.currentTarget.value = '';
              }}
              onChange={(event) => setFile(event.target.files?.[0])}
            />
            <Div>
              <Button
                size="m"
                mode="secondary"
                before={<Icon28AttachOutline />}
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? 'Выбрать другой файл' : 'Выбрать файл'}
              </Button>
              {file && (
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  {file.name} · {formatFileSize(file.size)}
                </div>
              )}
              {editingMaterial?.fileName && !file && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
                  Сейчас прикреплён файл: {editingMaterial.fileName}
                </div>
              )}
            </Div>
          </>
        ) : (
          <Div style={{ fontSize: 13, color: 'var(--vkui--color_text_secondary)' }}>
            Загрузка файлов доступна только когда приложение подключено к облачному хранилищу.
            Сейчас можно добавить описание и ссылку на материал.
          </Div>
        )}

        <FormItem top="Ссылка на материал (если файл лежит не у нас)">
          <Input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://..."
          />
        </FormItem>
      </Group>

      <Group>
        {error && (
          <FormItem status="error" bottom={error}>
            <span />
          </FormItem>
        )}

        <Div style={{ display: 'flex', gap: 8 }}>
          <Button stretched size="l" mode="primary" loading={saving} onClick={() => void handleSave()}>
            Сохранить
          </Button>
          <Button
            stretched
            size="l"
            mode="secondary"
            onClick={() => {
              startMaterialEditing(null);
              routeNavigator.push(PATHS.MATERIALS);
            }}
          >
            Отмена
          </Button>
        </Div>
      </Group>
    </Panel>
  );
};
