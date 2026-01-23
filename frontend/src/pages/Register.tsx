import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Input } from '../components/ui';

const schema = z
  .object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(6, 'Min 6 chars'),
    confirmPassword: z.string().min(6, 'Min 6 chars'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const nav = useNavigate();
  const { register: doRegister } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await doRegister(values.email, values.password);
      nav('/', { replace: true });
    } catch (e: any) {
      setError('root', { message: e?.message ?? 'Register failed' });
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500/20">
              <UserPlus className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <div className="text-xl font-bold">Create account</div>
              <div className="text-sm text-white/60">Simple email & password registration</div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            {errors.root?.message ? (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {errors.root.message}
              </div>
            ) : null}

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-white/60">
            Already have an account?{' '}
            <Link className="font-semibold text-indigo-300 hover:text-indigo-200" to="/login">
              Login
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}


