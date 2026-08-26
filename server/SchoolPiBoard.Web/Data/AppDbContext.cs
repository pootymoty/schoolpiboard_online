using Microsoft.EntityFrameworkCore;
using SchoolPiBoard.Web.Data.Entities;

namespace SchoolPiBoard.Web.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();

    public DbSet<EmailToken> EmailTokens => Set<EmailToken>();

    public DbSet<Board> Boards => Set<Board>();

    public DbSet<BoardMember> BoardMembers => Set<BoardMember>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.Email).HasColumnName("email").IsRequired();
            entity.Property(x => x.PasswordHash).HasColumnName("password_hash").IsRequired();
            entity.Property(x => x.DisplayName).HasColumnName("display_name").IsRequired();
            entity.Property(x => x.ExternalId).HasColumnName("external_id");
            entity.Property(x => x.EmailConfirmed).HasColumnName("email_confirmed").HasDefaultValue(false);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.LastSeenAt).HasColumnName("last_seen_at");
            entity.Property(x => x.DeletedAt).HasColumnName("deleted_at");

            entity.HasIndex(x => x.Email).IsUnique();
        });

        model.Entity<EmailToken>(entity =>
        {
            entity.ToTable("email_tokens");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.Kind).HasColumnName("kind").IsRequired();
            entity.Property(x => x.TokenHash).HasColumnName("token_hash").IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            entity.Property(x => x.UsedAt).HasColumnName("used_at");

            // Поиск идёт всегда по хешу кода из письма — это единственный
            // способ, которым к записи обращаются.
            entity.HasIndex(x => x.TokenHash);

            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<Board>(entity =>
        {
            entity.ToTable("boards");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.OwnerId).HasColumnName("owner_id");
            entity.Property(x => x.Title).HasColumnName("title").IsRequired();
            entity.Property(x => x.LinkToken).HasColumnName("link_token").IsRequired();
            entity.Property(x => x.LinkIssuedAt).HasColumnName("link_issued_at");
            entity.Property(x => x.AutoAdmit).HasColumnName("auto_admit").HasDefaultValue(false);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.Property(x => x.Locked).HasColumnName("locked").HasDefaultValue(false);
            entity.Property(x => x.BytesUsed).HasColumnName("bytes_used").HasDefaultValue(0L);
            entity.Property(x => x.DeletedAt).HasColumnName("deleted_at");

            entity.HasIndex(x => x.OwnerId);

            // Вход по ссылке — это поиск по токену, и он должен быть
            // быстрым и однозначным.
            entity.HasIndex(x => x.LinkToken).IsUnique();

            entity.HasOne(x => x.Owner)
                .WithMany()
                .HasForeignKey(x => x.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<BoardMember>(entity =>
        {
            entity.ToTable("board_members");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.BoardId).HasColumnName("board_id");
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.Role).HasColumnName("role").IsRequired();
            entity.Property(x => x.Source).HasColumnName("source").IsRequired();
            entity.Property(x => x.JoinedAt).HasColumnName("joined_at");
            entity.Property(x => x.BannedAt).HasColumnName("banned_at");

            // Один человек — одна строка на доске. Уникальный индекс, а не
            // проверка перед вставкой: два одновременных входа по ссылке
            // прошли бы такую проверку оба.
            entity.HasIndex(x => new { x.BoardId, x.UserId }).IsUnique();

            entity.HasOne(x => x.Board)
                .WithMany()
                .HasForeignKey(x => x.BoardId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
