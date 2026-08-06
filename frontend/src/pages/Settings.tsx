import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Settings2, Trash2, Users } from 'lucide-react'

import { AppLayout } from '@/components/layout/AppLayout'
import { BranchFormDialog, type Branch } from '@/components/settings/BranchFormDialog'
import { UserFormDialog, type StaffUser } from '@/components/settings/UserFormDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}

export function Settings() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [userFormOpen, setUserFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null)
  const [branchFormOpen, setBranchFormOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, b] = await Promise.all([
        apiFetch<StaffUser[]>('/users'),
        apiFetch<Branch[]>('/branches'),
      ])
      setUsers(u)
      setBranches(b)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleUser = async (user: StaffUser) => {
    try {
      await apiFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario')
    }
  }

  const deleteBranch = async (branch: Branch) => {
    if (!confirm(`¿Eliminar la sucursal "${branch.name}"?`)) return
    try {
      await apiFetch(`/branches/${branch.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la sucursal')
    }
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configuración de la clínica</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios, sucursales y catálogo de servicios
        </p>
      </div>

      {error && <ErrorState description={error} onRetry={load} className="mb-6" />}
      {loading && <LoadingState label="Cargando configuración…" />}

      {!loading && !error && (
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-2 size-4" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="branches">
              <Settings2 className="mr-2 size-4" /> Sucursales
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{users.length} cuentas de staff</p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingUser(null)
                  setUserFormOpen(true)
                }}
              >
                <Plus /> Nuevo usuario
              </Button>
            </div>
            {users.length === 0 ? (
              <EmptyState title="Sin usuarios" description="Crea la primera cuenta de staff." />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{ROLE_LABELS[u.role] ?? u.role}</TableCell>
                        <TableCell>{u.branch_name ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? 'success' : 'secondary'}>
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${u.full_name}`}
                            onClick={() => {
                              setEditingUser(u)
                              setUserFormOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUser(u)}
                            className="text-destructive"
                          >
                            {u.is_active ? 'Desactivar' : 'Activar'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="branches" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {branches.length} sucursales — agenda e inventario independientes
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingBranch(null)
                  setBranchFormOpen(true)
                }}
              >
                <Plus /> Nueva sucursal
              </Button>
            </div>
            {branches.length === 0 ? (
              <EmptyState title="Sin sucursales" description="Crea tu primera sucursal." />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>{b.address ?? '—'}</TableCell>
                        <TableCell>{b.phone ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${b.name}`}
                            onClick={() => {
                              setEditingBranch(b)
                              setBranchFormOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Eliminar ${b.name}`}
                            className="text-destructive"
                            onClick={() => deleteBranch(b)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              El catálogo de servicios y precios se gestiona en{' '}
              <Link to="/services" className="font-medium text-primary hover:text-primary-hover">
                Servicios
              </Link>
              .
            </p>
          </TabsContent>
        </Tabs>
      )}

      <UserFormDialog
        open={userFormOpen}
        user={editingUser}
        onOpenChange={setUserFormOpen}
        onSaved={() => {
          setUserFormOpen(false)
          setEditingUser(null)
          load()
        }}
      />
      <BranchFormDialog
        open={branchFormOpen}
        branch={editingBranch}
        onOpenChange={setBranchFormOpen}
        onSaved={() => {
          setBranchFormOpen(false)
          setEditingBranch(null)
          load()
        }}
      />
    </AppLayout>
  )
}
