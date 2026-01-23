import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Input } from '../components/ui';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Min 6 chars'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.email, values.password);
      nav('/', { replace: true });
    } catch (e: any) {
      setError('root', { message: e?.message ?? 'Login failed' });
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500/20">
              <LogIn className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <div className="text-xl font-bold">Welcome back</div>
              <div className="text-sm text-white/60">Login with email & password</div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            {errors.root?.message ? (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {errors.root.message}
              </div>
            ) : null}

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in…' : 'Login'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-white/60">
            Don’t have an account?{' '}
            <Link className="font-semibold text-indigo-300 hover:text-indigo-200" to="/register">
              Register
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}


