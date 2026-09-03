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

    public DbSet<BoardItem> BoardItems => Set<BoardItem>();

    public DbSet<BoardPage> BoardPages => Set<BoardPage>();

    public DbSet<BoardPageViewer> BoardPageViewers => Set<BoardPageViewer>();

    public DbSet<StoredFile> StoredFiles => Set<StoredFile>();

    public DbSet<Plan> Plans => Set<Plan>();

    public DbSet<Subscription> Subscriptions => Set<Subscription>();

    public DbSet<BillingOrder> BillingOrders => Set<BillingOrder>();

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
            entity.Property(x => x.Background).HasColumnName("background").IsRequired();
            entity.Property(x => x.GridStyle).HasColumnName("grid_style").IsRequired();
            entity.Property(x => x.GridColor).HasColumnName("grid_color").IsRequired();
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

        model.Entity<BoardItem>(entity =>
        {
            entity.ToTable("board_items");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.BoardId).HasColumnName("board_id");
            entity.Property(x => x.PageId).HasColumnName("page_id");
            entity.Property(x => x.Type).HasColumnName("type").IsRequired();
            entity.Property(x => x.Z).HasColumnName("z");
            entity.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb").IsRequired();
            entity.Property(x => x.ImageRef).HasColumnName("image_ref");
            entity.Property(x => x.CreatedBy).HasColumnName("created_by");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.Property(x => x.LockedBy).HasColumnName("locked_by");
            entity.Property(x => x.LockedAt).HasColumnName("locked_at");

            // Читается всегда одна страница и в порядке отрисовки —
            // единственный способ, которым к этой таблице обращаются.
            entity.HasIndex(x => new { x.PageId, x.Z });

            entity.HasOne(x => x.Board)
                .WithMany()
                .HasForeignKey(x => x.BoardId)
                .OnDelete(DeleteBehavior.Cascade);

            // Ссылки на страницу в объекте нет: она никогда не нужна вместе
            // с ним, а связь в базе быть должна — удалённая страница не
            // должна оставлять за собой объекты ниоткуда.
            entity.HasOne<BoardPage>()
                .WithMany()
                .HasForeignKey(x => x.PageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<StoredFile>(entity =>
        {
            entity.ToTable("stored_files");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.OwnerId).HasColumnName("owner_id");
            entity.Property(x => x.Kind).HasColumnName("kind").IsRequired();
            entity.Property(x => x.BoardId).HasColumnName("board_id");
            entity.Property(x => x.Name).HasColumnName("name").IsRequired();
            entity.Property(x => x.ContentType).HasColumnName("content_type").IsRequired();
            entity.Property(x => x.Size).HasColumnName("size");
            entity.Property(x => x.StorageKey).HasColumnName("storage_key").IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");

            // Библиотека показывается списком, место считается суммой — и то,
            // и другое идёт по владельцу.
            entity.HasIndex(x => new { x.OwnerId, x.Kind });

            // Удаление доски уносит и её картинки.
            entity.HasIndex(x => x.BoardId);

            // По ключу картинку отдают браузеру: ключ неугадываемый и
            // работает как сама ссылка на доску.
            entity.HasIndex(x => x.StorageKey).IsUnique();

            // Связи с пользователем и доской намеренно нет: файлы переживают
            // удаление учётной записи и уходят вместе с ней позже, по общему
            // сроку хранения.
        });

        model.Entity<Plan>(entity =>
        {
            entity.ToTable("plans");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.Code).HasColumnName("code").IsRequired();
            entity.Property(x => x.Name).HasColumnName("name").IsRequired();
            entity.Property(x => x.Active).HasColumnName("active");
            entity.Property(x => x.Sort).HasColumnName("sort");
            entity.Property(x => x.Price30).HasColumnName("price_30");
            entity.Property(x => x.Price90).HasColumnName("price_90");
            entity.Property(x => x.Price180).HasColumnName("price_180");
            entity.Property(x => x.Price365).HasColumnName("price_365");
            entity.Property(x => x.MaxBoards).HasColumnName("max_boards");
            entity.Property(x => x.MaxStorageBytes).HasColumnName("max_storage_bytes");
            entity.Property(x => x.MaxParticipants).HasColumnName("max_participants");
            entity.Property(x => x.HasLibrary).HasColumnName("has_library");

            // Бесплатный тариф ищут по коду на каждом запросе о пределах.
            entity.HasIndex(x => x.Code).IsUnique();
        });

        model.Entity<Subscription>(entity =>
        {
            entity.ToTable("subscriptions");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.PlanId).HasColumnName("plan_id");
            entity.Property(x => x.Kind).HasColumnName("kind").IsRequired();
            entity.Property(x => x.StartsAt).HasColumnName("starts_at");
            entity.Property(x => x.EndsAt).HasColumnName("ends_at");
            entity.Property(x => x.Source).HasColumnName("source").IsRequired();
            entity.Property(x => x.InvoiceId).HasColumnName("invoice_id");
            entity.Property(x => x.AutoRenew).HasColumnName("auto_renew");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");

            // Действующую подписку ищут по владельцу и дате окончания.
            entity.HasIndex(x => new { x.UserId, x.EndsAt });

            // Повторный обратный вызов с тем же счётом не должен продлевать
            // срок дважды — это стережёт база, а не только код.
            entity.HasIndex(x => x.InvoiceId).IsUnique();

            entity.HasOne(x => x.Plan)
                .WithMany()
                .HasForeignKey(x => x.PlanId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<BoardPage>(entity =>
        {
            entity.ToTable("board_pages");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.BoardId).HasColumnName("board_id");
            entity.Property(x => x.Title).HasColumnName("title").IsRequired();
            entity.Property(x => x.Sort).HasColumnName("sort");
            entity.Property(x => x.Visibility).HasColumnName("visibility").IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");

            // Страницы читаются полосой, в своём порядке.
            entity.HasIndex(x => new { x.BoardId, x.Sort });

            entity.HasOne(x => x.Board)
                .WithMany()
                .HasForeignKey(x => x.BoardId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<BoardPageViewer>(entity =>
        {
            entity.ToTable("board_page_viewers");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.PageId).HasColumnName("page_id");
            entity.Property(x => x.ParticipantKey).HasColumnName("participant_key").IsRequired();

            // Один и тот же участник не должен попасть в список дважды.
            entity.HasIndex(x => new { x.PageId, x.ParticipantKey }).IsUnique();

            entity.HasOne(x => x.Page)
                .WithMany()
                .HasForeignKey(x => x.PageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<BillingOrder>(entity =>
        {
            entity.ToTable("billing_orders");
            entity.HasKey(x => x.Id);

            entity.Property(x => x.Id).HasColumnName("id").UseIdentityByDefaultColumn();
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.InvoiceId).HasColumnName("invoice_id").IsRequired();
            entity.Property(x => x.PlanCode).HasColumnName("plan_code").IsRequired();
            entity.Property(x => x.PlanName).HasColumnName("plan_name").IsRequired();
            entity.Property(x => x.Days).HasColumnName("days");
            entity.Property(x => x.Amount).HasColumnName("amount");
            entity.Property(x => x.AutoRenew).HasColumnName("auto_renew");
            entity.Property(x => x.StartNow).HasColumnName("start_now");
            entity.Property(x => x.Status).HasColumnName("status").IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.PaidAt).HasColumnName("paid_at");

            // История показывается своей, свежие сверху.
            entity.HasIndex(x => new { x.UserId, x.CreatedAt });

            // Подтверждение приходит по номеру счёта, и он же не даёт
            // завести два заказа на один счёт.
            entity.HasIndex(x => x.InvoiceId).IsUnique();
        });
    }
}
