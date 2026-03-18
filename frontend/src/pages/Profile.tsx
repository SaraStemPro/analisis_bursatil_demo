import { useAuthStore } from '../context/auth-store'

export default function Profile() {
  const { user } = useAuthStore()

  if (!user) return null

  const roleLabel = { student: 'Estudiante', professor: 'Profesor', admin: 'Administrador' }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Perfil</h1>

      <div className="bg-white rounded-lg p-6 border border-gray-300 space-y-4">
        <div>
          <p className="text-sm text-gray-500">Usuario</p>
          <p className="font-medium">{user.name}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Rol</p>
          <p className="font-medium">{roleLabel[user.role] || user.role}</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Miembro desde</p>
          <p className="font-medium">{new Date(user.created_at).toLocaleDateString('es-ES')}</p>
        </div>
      </div>
    </div>
  )
}
