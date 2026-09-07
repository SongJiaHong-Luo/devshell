import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { useServerStore } from '@/stores/server-store'
import type { Group } from '@shared/types/server'

interface GroupDialogProps {
  open: boolean
  projectId: string
  parentGroupId?: string
  group?: Group
  onOpenChange: (open: boolean) => void
}

export function GroupDialog({
  open,
  projectId,
  parentGroupId,
  group,
  onOpenChange
}: GroupDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [enableBastion, setEnableBastion] = useState(false)
  const [bastionHost, setBastionHost] = useState('')
  const [bastionPort, setBastionPort] = useState('22')
  const [bastionUsername, setBastionUsername] = useState('')
  const [bastionAuthType, setBastionAuthType] = useState<'password' | 'key'>('password')
  const [bastionPassword, setBastionPassword] = useState('')
  const [bastionPrivateKeyPath, setBastionPrivateKeyPath] = useState('')

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setDescription(group?.description ?? '')
      setEnableBastion(!!group?.bastion)
      setBastionHost(group?.bastion?.host ?? '')
      setBastionPort(String(group?.bastion?.port ?? 22))
      setBastionUsername(group?.bastion?.username ?? '')
      setBastionAuthType(group?.bastion?.authType ?? 'password')
      setBastionPassword(group?.bastion?.password ?? '')
      setBastionPrivateKeyPath(group?.bastion?.privateKeyPath ?? '')
    }
  }, [open, group])

  const handleSelectPrivateKey = async () => {
    const result = await window.api.system.selectFile({
      title: t('groupDialog.selectPrivateKey'),
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (result) {
      setBastionPrivateKeyPath(result)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!name.trim()) {
      return
    }

    // Validate group name
    const isValid = await window.api.server.validateGroupName(
      projectId,
      parentGroupId || null,
      name.trim(),
      group?.id
    )
    if (!isValid) {
      // Show error message or handle invalid name
      return
    }

    const data = {
      name: name.trim(),
      description: description.trim() || undefined,
      bastion: enableBastion
        ? {
            host: bastionHost.trim(),
            port: parseInt(bastionPort) || 22,
            username: bastionUsername.trim(),
            authType: bastionAuthType,
            ...(bastionAuthType === 'password'
              ? { password: bastionPassword }
              : { privateKeyPath: bastionPrivateKeyPath.trim() })
          }
        : undefined
    }

    if (group) {
      await window.api.server.updateGroup(projectId, group.id, data)
    } else {
      await window.api.server.addGroup(projectId, parentGroupId || null, data)
    }

    useServerStore.getState().fetchProjects()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {group ? t('groupDialog.editTitle') : t('groupDialog.newTitle')}
            </DialogTitle>
            <DialogDescription>
              {group ? t('groupDialog.editDesc') : t('groupDialog.newDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="group-name">{t('common.name')}</Label>
              <Input
                id="group-name"
                placeholder={t('groupDialog.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="group-description">{t('common.description')}</Label>
              <Textarea
                id="group-description"
                placeholder={t('groupDialog.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <Collapsible open={enableBastion} onOpenChange={setEnableBastion}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between">
                  <Label>{t('groupDialog.enableBastion')}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-9 p-0"
                  >
                    {enableBastion ? '-' : '+'}
                  </Button>
                </div>
              </CollapsibleTrigger>
              {enableBastion && (
                <CollapsibleContent className="mt-4 grid gap-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 grid gap-2">
                      <Label htmlFor="bastion-host">{t('groupDialog.bastionHost')}</Label>
                      <Input
                        id="bastion-host"
                        placeholder={t('groupDialog.bastionHostPlaceholder')}
                        value={bastionHost}
                        onChange={(e) => setBastionHost(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="bastion-port">{t('groupDialog.bastionPort')}</Label>
                      <Input
                        id="bastion-port"
                        type="number"
                        placeholder="22"
                        value={bastionPort}
                        onChange={(e) => setBastionPort(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="bastion-username">
                      {t('groupDialog.bastionUsername')}
                    </Label>
                    <Input
                      id="bastion-username"
                      placeholder={t('groupDialog.bastionUsernamePlaceholder')}
                      value={bastionUsername}
                      onChange={(e) => setBastionUsername(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('groupDialog.bastionAuthentication')}</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={bastionAuthType === 'password' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setBastionAuthType('password')}
                      >
                        {t('groupDialog.password')}
                      </Button>
                      <Button
                        type="button"
                        variant={bastionAuthType === 'key' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setBastionAuthType('key')}
                      >
                        {t('groupDialog.privateKey')}
                      </Button>
                    </div>
                  </div>
                  {bastionAuthType === 'password' ? (
                    <div className="grid gap-2">
                      <Label htmlFor="bastion-password">
                        {t('groupDialog.bastionPassword')}
                      </Label>
                      <Input
                        id="bastion-password"
                        type="password"
                        placeholder={t('groupDialog.bastionPasswordPlaceholder')}
                        value={bastionPassword}
                        onChange={(e) => setBastionPassword(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="bastion-key">
                        {t('groupDialog.bastionPrivateKeyPath')}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="bastion-key"
                          placeholder={t('groupDialog.bastionPrivateKeyPlaceholder')}
                          value={bastionPrivateKeyPath}
                          onChange={(e) => setBastionPrivateKeyPath(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSelectPrivateKey}
                        >
                          {t('common.browse')}
                        </Button>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              )}
            </Collapsible>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!name.trim()} onClick={handleSubmit}>
              {group ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
